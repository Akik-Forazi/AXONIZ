/**
 * axoniz/integrations/unified_memory.ts
 * ======================================
 * Merges Hermes MemoryManager + MemPalace palace + axoniz SemanticMemory
 * into one object used directly by axoniz.core.agent.Agent.
 *
 * Port of axoniz/integrations/unified_memory.py
 *
 * ── STORAGE (port decision) ──────────────────────────────────────────────────
 * The Python palace is a ChromaDB vector store provided by the `mempalace`
 * package. Neither `mempalace` nor `chromadb` has an installable npm equivalent
 * on this machine (the chromadb npm install repeatedly failed against the
 * degraded registry), so the palace is backed by a **local SQLite store using
 * Node's built-in `node:sqlite` (`DatabaseSync`)** — zero dependencies, fully
 * local. Verified working on Node v24.21.0 (including recursive CTEs and FTS5).
 *
 * Because there are no embeddings, "semantic" palace search is performed with
 * the already-ported TF-IDF scorer from `src/core/memory.ts`
 * (`tokenize` + `tfidfScore` over the stored documents). This is a genuine
 * capability downgrade vs. ChromaDB embeddings:
 *   - ranking is lexical (TF-IDF cosine), not semantic — paraphrases that share
 *     no vocabulary are not retrieved, and drawers with zero vocabulary overlap
 *     are dropped entirely (a lexical ranker cannot order them);
 *   - there is no ANN index, so search is a linear scan over the filtered
 *     drawer set (fine for the local-first scale this targets).
 *
 * The seam for a real embedding backend is `registerEmbeddingBackend()`: pass an
 * object with `name` + `embed(texts)` (sync OR async, e.g. a local
 * node-llama-cpp embedding model) and `PalaceLayer.search()` /
 * `PalaceLayer.searchAsync()` will rank by cosine similarity over those vectors
 * instead of TF-IDF. `VectorBackend` keeps the ChromaDB-shaped surface
 * (add/search/delete/status/get), so a Chroma-backed implementation can be
 * dropped in via the `PalaceLayer` constructor's second argument.
 *
 * ── Other degradations ──────────────────────────────────────────────────────
 *  - `mempalace.palace_graph` (traverse / find_tunnels / graph_stats) is not in
 *    the Python reference tree, so it is re-implemented over the drawer
 *    wing/room metadata (see PalaceLayer.traverse_graph for the graph model).
 *  - `mempalace.knowledge_graph.KnowledgeGraph` is replaced by
 *    `SqliteKnowledgeGraph`, which is the Python `_MinimalKG` fallback plus
 *    real `as_of` temporal filtering (the fallback ignored `as_of`, the original
 *    mempalace class honoured it). Return shapes are unchanged.
 *  - `chromadb`-specific status strings became backend-neutral.
 *  - `threading.Thread(daemon=True)` in `prefetch`/`sync_turn` became
 *    fire-and-forget async tasks (both are now awaitable and never reject).
 *  - `threading.Lock` in `_prefetch_lock` is dropped: the JS event loop is
 *    single-threaded and the field is a plain string assignment.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AXONIZ_HOME, MEMORY_PATH } from "../core/config.js";
import { SemanticMemory, tokenize, tfidfScore } from "../core/memory.js";
import { toolArgs, optStr, optNum } from "../core/extras.js";
import { getLogger } from "../core/logger.js";

const logger = getLogger();

/* ── Paths shared across sub-systems ────────────────────────────────────────── */

export const PALACE_PATH = path.join(AXONIZ_HOME, "palace");
export const KG_PATH = path.join(AXONIZ_HOME, "knowledge_graph.sqlite3");
export const WAL_DIR = path.join(AXONIZ_HOME, "wal");
/** SQLite file holding the palace drawers (replaces the ChromaDB directory). */
export const PALACE_DB_PATH = path.join(PALACE_PATH, "palace.sqlite3");

export const COLLECTION_NAME = "mempalace_drawers";

for (const dir of [PALACE_PATH, WAL_DIR]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* best effort, matching Python's makedirs(exist_ok=True) */
  }
}

/* ── context fencing (from hermes memory_manager.py) ────────────────────────── */

const _FENCE_TAG_RE = /<\/?\s*memory-context\s*>/gi;

export function _sanitize_context(text: string): string {
  return text.replace(_FENCE_TAG_RE, "");
}

/** Wrap recalled memory in a fenced block — prevents the model treating it as user input. */
export function _build_memory_context_block(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const clean = _sanitize_context(raw);
  return (
    "<memory-context>\n" +
    "[System note: recalled memory context — NOT new user input. Treat as background.]\n\n" +
    `${clean}\n` +
    "</memory-context>"
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Embedding seam — plug a real embedding backend in here
 * ════════════════════════════════════════════════════════════════════════════ */

export interface EmbeddingBackend {
  readonly name: string;
  /** Embed a batch of texts. May be sync (fast, cached) or async (a real model). */
  embed(texts: string[]): number[][] | Promise<number[][]>;
  /** Optional custom similarity; defaults to cosine. */
  similarity?(a: number[], b: number[]): number;
}

let _embeddingBackend: EmbeddingBackend | null = null;

/**
 * Register (or clear, with `null`) the embedding backend used for palace
 * ranking. When none is registered the palace falls back to TF-IDF.
 */
export function registerEmbeddingBackend(backend: EmbeddingBackend | null): void {
  _embeddingBackend = backend;
}

export function getEmbeddingBackend(): EmbeddingBackend | null {
  return _embeddingBackend;
}

/** Cosine similarity (0 when either vector is empty/zero-length). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ════════════════════════════════════════════════════════════════════════════
 * VectorBackend — pluggable palace storage (SQLite default, ChromaDB later)
 * ════════════════════════════════════════════════════════════════════════════ */

export interface VectorRecord {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
}

export interface VectorSearchHit {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
  /** 1 - similarity (Chroma-style distance). */
  distance: number;
  similarity: number;
  /** Raw TF-IDF dot-product score used for ordering. */
  score: number;
}

export interface VectorFilter {
  wing?: string | null;
  room?: string | null;
}

export interface VectorSearchOptions extends VectorFilter {
  limit?: number;
  maxDistance?: number;
}

export interface VectorBackendStatus {
  backend: string;
  total: number;
  available: boolean;
  error?: string;
}

export interface VectorBackend {
  readonly name: string;
  /** Upsert drawer records. */
  add(records: VectorRecord[]): void;
  /** Fetch records by id and/or wing/room filter. */
  get(ids?: string[] | null, filter?: VectorFilter): VectorRecord[];
  /** Delete by id; returns the number of deleted rows. */
  delete(ids: string[]): number;
  count(filter?: VectorFilter): number;
  search(query: string, options?: VectorSearchOptions): VectorSearchHit[];
  status(): VectorBackendStatus;
  close(): void;
}

/* ── SQLite implementation (the default, dependency-free backend) ──────────── */

function placeholders(n: number): string {
  return new Array(n).fill("?").join(",");
}

function buildIdf(docs: string[][]): Map<string, number> {
  const N = Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const tokens of docs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, c] of df) idf.set(t, Math.log(N / (1 + c)));
  return idf;
}

/** TF-IDF weight map matching `tfidfScore`'s tf = count/total convention. */
function tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  if (tokens.length === 0) return vec;
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [t, c] of tf) vec.set(t, (c / tokens.length) * (idf.get(t) ?? Math.log(10)));
  return vec;
}

function cosineMaps(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const other = large.get(t);
    if (other !== undefined) dot += w * other;
  }
  let na = 0;
  for (const w of a.values()) na += w * w;
  let nb = 0;
  for (const w of b.values()) nb += w * w;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Drawer store on `node:sqlite`. Documents + wing/room metadata live in a plain
 * table; similarity is TF-IDF (see the module header) unless an embedding
 * backend is registered.
 */
export class SqliteVectorBackend implements VectorBackend {
  readonly name = "sqlite-tfidf";
  readonly dbPath: string;
  protected db: DatabaseSync | null = null;
  protected openError: string | null = null;

  constructor(dbPath: string = PALACE_DB_PATH) {
    this.dbPath = dbPath;
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode=WAL");
      db.exec(
        `CREATE TABLE IF NOT EXISTS drawers (
           id TEXT PRIMARY KEY,
           document TEXT NOT NULL,
           wing TEXT,
           room TEXT,
           added_by TEXT,
           filed_at TEXT
         )`,
      );
      db.exec("CREATE INDEX IF NOT EXISTS idx_drawers_wing ON drawers(wing)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_drawers_room ON drawers(room)");
      this.db = db;
    } catch (e) {
      this.openError = e instanceof Error ? e.message : String(e);
      this.db = null;
    }
  }

  get available(): boolean {
    return this.db !== null;
  }

  protected rowToRecord(row: Record<string, unknown>): VectorRecord {
    return {
      id: String(row["id"] ?? ""),
      document: String(row["document"] ?? ""),
      metadata: {
        wing: String(row["wing"] ?? "unknown"),
        room: String(row["room"] ?? "unknown"),
        added_by: String(row["added_by"] ?? ""),
        filed_at: String(row["filed_at"] ?? ""),
      },
    };
  }

  add(records: VectorRecord[]): void {
    const db = this.db;
    if (!db || records.length === 0) return;
    const stmt = db.prepare(
      `INSERT INTO drawers (id, document, wing, room, added_by, filed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         document = excluded.document,
         wing = excluded.wing,
         room = excluded.room,
         added_by = excluded.added_by,
         filed_at = excluded.filed_at`,
    );
    for (const rec of records) {
      stmt.run(
        rec.id,
        rec.document,
        String(rec.metadata["wing"] ?? "unknown"),
        String(rec.metadata["room"] ?? "unknown"),
        String(rec.metadata["added_by"] ?? ""),
        String(rec.metadata["filed_at"] ?? ""),
      );
    }
  }

  get(ids?: string[] | null, filter?: VectorFilter): VectorRecord[] {
    const db = this.db;
    if (!db) return [];
    const where: string[] = [];
    const params: Array<string> = [];
    if (ids && ids.length > 0) {
      where.push(`id IN (${placeholders(ids.length)})`);
      params.push(...ids);
    }
    if (filter?.wing) {
      where.push("wing = ?");
      params.push(filter.wing);
    }
    if (filter?.room) {
      where.push("room = ?");
      params.push(filter.room);
    }
    const sql = `SELECT id, document, wing, room, added_by, filed_at FROM drawers${
      where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
    }`;
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToRecord(r));
  }

  delete(ids: string[]): number {
    const db = this.db;
    if (!db || ids.length === 0) return 0;
    const stmt = db.prepare(`DELETE FROM drawers WHERE id IN (${placeholders(ids.length)})`);
    const res = stmt.run(...ids);
    return Number(res.changes ?? 0);
  }

  count(filter?: VectorFilter): number {
    const db = this.db;
    if (!db) return 0;
    const where: string[] = [];
    const params: Array<string> = [];
    if (filter?.wing) {
      where.push("wing = ?");
      params.push(filter.wing);
    }
    if (filter?.room) {
      where.push("room = ?");
      params.push(filter.room);
    }
    const sql = `SELECT COUNT(*) AS n FROM drawers${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""}`;
    const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
    return Number(row?.["n"] ?? 0);
  }

  /**
   * TF-IDF ranked search over the filtered drawer set.
   * `similarity` is TF-IDF cosine in [0,1]; `distance` is 1 - similarity.
   *
   * Lexical ranker caveat: a drawer that shares no vocabulary with the query
   * scores 0 and is dropped (a lexical ranker cannot order it, and returning it
   * would put unrelated text in the context block). ChromaDB embeddings would
   * still return such drawers at a high distance.
   */
  search(query: string, options: VectorSearchOptions = {}): VectorSearchHit[] {
    const limit = options.limit ?? 5;
    const maxDistance = options.maxDistance ?? 1.5;
    const candidates = this.get(null, { wing: options.wing ?? null, room: options.room ?? null });
    if (candidates.length === 0) return [];

    const qTokens = tokenize(query);
    const docTokens = candidates.map((c) => tokenize(c.document));
    const idf = buildIdf(docTokens);
    const qVec = tfidfVector(qTokens, idf);

    const hits: VectorSearchHit[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const tokens = docTokens[i];
      const score = tfidfScore(qTokens, tokens, idf);
      if (score <= 0) continue; // no shared vocabulary — not retrievable lexically
      const similarity = round3(cosineMaps(qVec, tfidfVector(tokens, idf)));
      const distance = round3(1 - similarity);
      if (distance > maxDistance) continue;
      hits.push({
        id: candidates[i].id,
        document: candidates[i].document,
        metadata: candidates[i].metadata,
        distance,
        similarity,
        score,
      });
    }

    hits.sort((a, b) => b.score - a.score || b.similarity - a.similarity);
    return hits.slice(0, limit);
  }

  status(): VectorBackendStatus {
    if (!this.db) {
      return { backend: this.name, total: 0, available: false, error: this.openError ?? "SQLite palace unavailable" };
    }
    try {
      return { backend: this.name, total: this.count(), available: true };
    } catch (e) {
      return { backend: this.name, total: 0, available: false, error: errMsg(e) };
    }
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      /* ignore */
    }
    this.db = null;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ════════════════════════════════════════════════════════════════════════════
 * PalaceLayer — wings/rooms/drawers + graph traversal
 * ════════════════════════════════════════════════════════════════════════════ */

export interface PalaceSearchHit {
  id: string;
  text: string;
  wing: string;
  room: string;
  distance: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface PalaceSearchResult {
  results: PalaceSearchHit[];
  error?: string;
}

export interface PalaceSearchOptions extends VectorFilter {
  limit?: number;
  /** Python-style alias accepted because `multi_agent.py` calls `search(task, top_k=3)`. */
  top_k?: number;
  max_distance?: number;
  maxDistance?: number;
}

export interface PalaceStatus {
  total_drawers: number;
  wings: Record<string, number>;
  palace_path?: string;
  backend?: string;
  error?: string;
}

export interface PalaceStoreOptions {
  wing: string;
  room: string;
  content: string;
  added_by?: string;
  addedBy?: string;
}

export interface PalaceStoreResult {
  success: boolean;
  id?: string;
  wing?: string;
  room?: string;
  reason?: string;
  error?: string;
}

export class PalaceLayer {
  palace_path: string;
  backend: VectorBackend;
  protected _available: boolean | null = null;
  protected _wal: string;
  /** ChromaDB-shaped compat shim — `agent.System_scan()` calls `_db.get()`. */
  readonly _db: {
    get: (ids?: string[] | null) => { ids: string[]; documents: string[]; metadatas: Array<Record<string, unknown>> };
  };

  constructor(palacePath: string = PALACE_PATH, backend?: VectorBackend) {
    this.palace_path = palacePath;
    this.backend = backend ?? new SqliteVectorBackend(path.join(palacePath, "palace.sqlite3"));
    this._wal = path.join(WAL_DIR, "palace_writes.jsonl");
    try {
      if (!fs.existsSync(this._wal)) {
        fs.writeFileSync(this._wal, "", { encoding: "utf-8", mode: 0o600 });
      }
    } catch {
      /* best effort */
    }
    this._db = {
      get: (ids?: string[] | null) => {
        const records = this.backend.get(ids ?? null);
        return {
          ids: records.map((r) => r.id),
          documents: records.map((r) => r.document),
          metadatas: records.map((r) => r.metadata),
        };
      },
    };
  }

  is_available(): boolean {
    if (this._available === null) {
      this._available = this.backend.status().available;
      if (!this._available) {
        logger.warning(
          "[Palace] local SQLite palace backend unavailable — palace disabled. " +
            "Check write access to " +
            this.palace_path,
        );
      }
    }
    return this._available;
  }

  /** Backend-neutral reason string used by search()/store() when disabled. */
  protected _unavailableReason(): string {
    return this.backend.status().error ?? "Palace backend unavailable";
  }

  /** Compat shim for the removed ChromaDB collection handle. */
  _get_col(create = true): VectorBackend | null {
    void create;
    if (!this.is_available()) return null;
    return this.backend;
  }

  _wal_log(op: string, info: Record<string, unknown>): void {
    const entry = { ts: new Date().toISOString(), op, ...info };
    try {
      fs.appendFileSync(this._wal, `${JSON.stringify(entry)}\n`, "utf-8");
    } catch {
      /* best effort */
    }
  }

  /* ── Read ───────────────────────────────────────────────────────────────── */

  /**
   * Search drawers. Accepts either positional Python args
   * (`search(q, wing, room, limit, maxDistance)`) or an options object
   * (`search(q, { top_k: 3 })`).
   */
  search(query: string, options?: PalaceSearchOptions): PalaceSearchResult;
  search(
    query: string,
    wing?: string | null,
    room?: string | null,
    limit?: number,
    maxDistance?: number,
  ): PalaceSearchResult;
  search(
    query: string,
    wingOrOptions?: string | PalaceSearchOptions | null,
    room?: string | null,
    limit = 5,
    maxDistance = 1.5,
  ): PalaceSearchResult {
    let wing: string | null = null;
    let rm: string | null = room ?? null;
    let lim = limit;
    let maxD = maxDistance;
    if (wingOrOptions !== null && typeof wingOrOptions === "object") {
      const o = wingOrOptions;
      wing = o.wing ?? null;
      rm = o.room ?? null;
      lim = o.limit ?? o.top_k ?? 5;
      maxD = o.max_distance ?? o.maxDistance ?? 1.5;
    } else {
      wing = (wingOrOptions as string | null | undefined) ?? null;
    }

    if (!this.is_available()) {
      return { results: [], error: this._unavailableReason() };
    }
    try {
      const hits = this.backend.search(query, { wing, room: rm, limit: lim, maxDistance: maxD });
      return {
        results: hits.map((h) => ({
          id: h.id,
          text: h.document,
          wing: String(h.metadata["wing"] ?? "unknown"),
          room: String(h.metadata["room"] ?? "unknown"),
          distance: h.distance,
          similarity: h.similarity,
          metadata: h.metadata,
        })),
      };
    } catch (e) {
      return { results: [], error: errMsg(e) };
    }
  }

  /**
   * Additive async search: uses the registered embedding backend (awaiting it)
   * when present, otherwise behaves exactly like `search()`.
   */
  async searchAsync(query: string, options: PalaceSearchOptions = {}): Promise<PalaceSearchResult> {
    const backend = getEmbeddingBackend();
    if (!backend || !this.is_available()) {
      return this.search(query, options);
    }
    try {
      const lim = options.limit ?? options.top_k ?? 5;
      const maxD = options.max_distance ?? options.maxDistance ?? 1.5;
      const candidates = this.backend.get(null, { wing: options.wing ?? null, room: options.room ?? null });
      if (candidates.length === 0) return { results: [] };
      const [qVec] = await Promise.resolve(backend.embed([query]));
      const docVecs = await Promise.resolve(backend.embed(candidates.map((c) => c.document)));
      const sim = backend.similarity ?? cosineSimilarity;
      const results: PalaceSearchHit[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const similarity = round3(sim(qVec ?? [], docVecs[i] ?? []));
        const distance = round3(1 - similarity);
        if (distance > maxD) continue;
        results.push({
          id: candidates[i].id,
          text: candidates[i].document,
          wing: String(candidates[i].metadata["wing"] ?? "unknown"),
          room: String(candidates[i].metadata["room"] ?? "unknown"),
          distance,
          similarity,
          metadata: candidates[i].metadata,
        });
      }
      results.sort((a, b) => b.similarity - a.similarity);
      return { results: results.slice(0, lim) };
    } catch (e) {
      return { results: [], error: errMsg(e) };
    }
  }

  status(): PalaceStatus {
    const st = this.backend.status();
    if (!st.available) {
      return { error: st.error ?? "Palace backend unavailable", total_drawers: 0, wings: {} };
    }
    try {
      const count = st.total;
      const wings: Record<string, number> = {};
      if (count > 0) {
        for (const rec of this.backend.get()) {
          const w = String(rec.metadata["wing"] ?? "unknown");
          wings[w] = (wings[w] ?? 0) + 1;
        }
      }
      return {
        total_drawers: count,
        wings,
        palace_path: this.palace_path,
        backend: this.backend.name,
      };
    } catch (e) {
      return { error: errMsg(e), total_drawers: 0, wings: {} };
    }
  }

  list_wings(): { wings: Record<string, number> } {
    const st = this.status();
    return { wings: st.wings ?? {} };
  }

  list_rooms(wing?: string | null): { wing?: string; rooms: Record<string, number>; error?: string } {
    if (!this.is_available()) {
      return { wing: wing ?? "all", rooms: {} };
    }
    try {
      const records = this.backend.get(null, { wing: wing ?? null });
      const rooms: Record<string, number> = {};
      for (const rec of records) {
        const r = String(rec.metadata["room"] ?? "unknown");
        rooms[r] = (rooms[r] ?? 0) + 1;
      }
      return { wing: wing ?? "all", rooms };
    } catch (e) {
      return { rooms: {}, error: errMsg(e) };
    }
  }

  get_context(): string {
    const st = this.status();
    if (st.error !== undefined && st.total_drawers === 0) {
      return "";
    }
    const wingStr = Object.entries(st.wings ?? {})
      .slice(0, 6)
      .map(([w, c]) => `${w}(${c})`)
      .join(", ");
    return `Palace: ${st.total_drawers} drawers | Wings: ${wingStr}`;
  }

  /* ── Graph helpers ──────────────────────────────────────────────────────── */

  protected _roomCounts(): { byWing: Map<string, Map<string, number>>; byRoom: Map<string, Map<string, number>> } {
    const byWing = new Map<string, Map<string, number>>();
    const byRoom = new Map<string, Map<string, number>>();
    for (const rec of this.backend.get()) {
      const w = String(rec.metadata["wing"] ?? "unknown");
      const r = String(rec.metadata["room"] ?? "unknown");
      if (!byWing.has(w)) byWing.set(w, new Map());
      byWing.get(w)!.set(r, (byWing.get(w)!.get(r) ?? 0) + 1);
      if (!byRoom.has(r)) byRoom.set(r, new Map());
      byRoom.get(r)!.set(w, (byRoom.get(r)!.get(w) ?? 0) + 1);
    }
    return { byWing, byRoom };
  }

  /**
   * Walk the palace graph from a room.
   *
   * Graph model (re-implementation — `mempalace.palace_graph` is not part of the
   * Python reference tree): a node is a (wing, room) pair. Two nodes are linked
   * when they live in the same wing ("wing" edges), and a room that exists in
   * more than one wing links those copies ("tunnel" edges). BFS is capped at
   * `max_hops` hops and at `MAX_TRAVERSE_NODES` visited nodes.
   */
  traverse_graph(startRoom: string, maxHops = 2): unknown {
    if (!this.is_available()) {
      return { error: "Palace unavailable" };
    }
    try {
      const { byWing, byRoom } = this._roomCounts();
      const MAX_TRAVERSE_NODES = 200;
      type Node = { wing: string; room: string; depth: number; drawers: number };
      const key = (w: string, r: string): string => `${w}\u0000${r}`;
      const visited = new Map<string, Node>();
      const edges: Array<{ from: [string, string]; to: [string, string]; kind: string }> = [];
      const startWings = [...(byRoom.get(startRoom)?.keys() ?? [])];
      if (startWings.length === 0) {
        return { start_room: startRoom, max_hops: maxHops, nodes: [], edges: [], error: "room not found" };
      }
      let frontier: Array<[string, string]> = [];
      for (const w of startWings) {
        const k = key(w, startRoom);
        visited.set(k, { wing: w, room: startRoom, depth: 0, drawers: byWing.get(w)?.get(startRoom) ?? 0 });
        frontier.push([w, startRoom]);
      }

      for (let depth = 1; depth <= maxHops && frontier.length > 0; depth++) {
        const next: Array<[string, string]> = [];
        for (const [w, r] of frontier) {
          // Tunnel: same room name in another wing.
          for (const w2 of byRoom.get(r)?.keys() ?? []) {
            if (w2 === w) continue;
            const k = key(w2, r);
            if (!visited.has(k)) {
              if (visited.size >= MAX_TRAVERSE_NODES) break;
              visited.set(k, { wing: w2, room: r, depth, drawers: byWing.get(w2)?.get(r) ?? 0 });
              next.push([w2, r]);
            }
            edges.push({ from: [w, r], to: [w2, r], kind: "tunnel" });
          }
          // Wing: sibling rooms in the same wing.
          for (const r2 of byWing.get(w)?.keys() ?? []) {
            if (r2 === r) continue;
            const k = key(w, r2);
            if (!visited.has(k)) {
              if (visited.size >= MAX_TRAVERSE_NODES) break;
              visited.set(k, { wing: w, room: r2, depth, drawers: byWing.get(w)?.get(r2) ?? 0 });
              next.push([w, r2]);
            }
            edges.push({ from: [w, r], to: [w, r2], kind: "wing" });
          }
        }
        frontier = next;
      }

      const nodes = [...visited.values()].sort(
        (a, b) => a.depth - b.depth || a.wing.localeCompare(b.wing) || a.room.localeCompare(b.room),
      );
      return { start_room: startRoom, max_hops: maxHops, nodes, edges };
    } catch (e) {
      return { error: errMsg(e) };
    }
  }

  /** Rooms that bridge two wings (or every room present in >1 wing). */
  find_tunnels(wingA?: string | null, wingB?: string | null): unknown {
    if (!this.is_available()) {
      return { error: "Palace unavailable" };
    }
    try {
      const { byRoom } = this._roomCounts();
      const tunnels: Array<{ room: string; wings: string[]; wings_count: number; drawers: number }> = [];
      for (const [room, wings] of byRoom) {
        if (wingA && !wings.has(wingA)) continue;
        if (wingB && !wings.has(wingB)) continue;
        if (wings.size < 2) continue;
        let drawers = 0;
        for (const c of wings.values()) drawers += c;
        tunnels.push({ room, wings: [...wings.keys()], wings_count: wings.size, drawers });
      }
      tunnels.sort((a, b) => b.wings_count - a.wings_count || b.drawers - a.drawers || a.room.localeCompare(b.room));
      return {
        wing_a: wingA ?? null,
        wing_b: wingB ?? null,
        tunnels: tunnels.slice(0, 50),
        count: tunnels.length,
      };
    } catch (e) {
      return { error: errMsg(e) };
    }
  }

  /** Palace graph overview: rooms, wings, intra-wing edges, tunnels. */
  graph_stats(): unknown {
    if (!this.is_available()) {
      return { error: "Palace unavailable" };
    }
    try {
      const { byWing, byRoom } = this._roomCounts();
      let edges = 0;
      for (const rooms of byWing.values()) {
        const n = rooms.size;
        if (n > 1) edges += (n * (n - 1)) / 2;
      }
      let tunnels = 0;
      for (const wings of byRoom.values()) {
        if (wings.size >= 2) tunnels += 1;
      }
      return {
        rooms: byRoom.size,
        wings: byWing.size,
        nodes: [...byWing.values()].reduce((acc, m) => acc + m.size, 0),
        edges,
        tunnels,
        total_drawers: this.backend.count(),
      };
    } catch (e) {
      return { error: errMsg(e) };
    }
  }

  /**
   * Duplicate check. ChromaDB reported `similarity = 1 - distance`; the SQLite
   * backend reports TF-IDF cosine directly, so `similarity` is comparable —
   * but lexical rather than semantic (see the module header).
   */
  check_duplicate(content: string, threshold = 0.9): { is_duplicate: boolean; matches?: Array<Record<string, unknown>>; error?: string } {
    if (!this.is_available()) {
      return { is_duplicate: false };
    }
    try {
      const hits = this.backend.search(content, { limit: 3 });
      const dups: Array<Record<string, unknown>> = [];
      for (const h of hits) {
        const sim = round3(h.similarity);
        if (sim >= threshold) {
          dups.push({ id: h.id, similarity: sim, content: h.document.slice(0, 200) });
        }
      }
      return { is_duplicate: dups.length > 0, matches: dups };
    } catch (e) {
      return { is_duplicate: false, error: errMsg(e) };
    }
  }

  /* ── Write ──────────────────────────────────────────────────────────────── */

  /**
   * Store a drawer. Accepts the Python positional form
   * (`store(wing, room, content, addedBy)`) or the kwargs-object form used by
   * the ported tool maps (`store({ wing, room, content, added_by })`).
   */
  store(options: PalaceStoreOptions): PalaceStoreResult;
  store(wing: string, room: string, content: string, addedBy?: string): PalaceStoreResult;
  store(
    wingOrOptions: string | PalaceStoreOptions,
    room?: string,
    content?: string,
    addedBy = "axoniz",
  ): PalaceStoreResult {
    let wing: string;
    let rm: string;
    let body: string;
    let by = addedBy;
    if (wingOrOptions !== null && typeof wingOrOptions === "object") {
      wing = wingOrOptions.wing;
      rm = wingOrOptions.room;
      body = wingOrOptions.content;
      by = wingOrOptions.added_by ?? wingOrOptions.addedBy ?? addedBy;
    } else {
      wing = wingOrOptions;
      rm = room ?? "";
      body = content ?? "";
    }

    if (!this.is_available()) {
      return { success: false, error: this._unavailableReason() };
    }

    const w = wing.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40);
    const r = rm.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40);
    const digest = createHash("sha256").update(`${w}${r}${body.slice(0, 100)}`).digest("hex").slice(0, 20);
    const drawerId = `drawer_${w}_${r}_${digest}`;

    this._wal_log("store", { wing: w, room: r, id: drawerId, added_by: by });

    try {
      if (this.backend.get([drawerId]).length > 0) {
        return { success: true, reason: "already_exists", id: drawerId };
      }
    } catch {
      /* ignore lookup failure and try the upsert, as Python does */
    }

    try {
      this.backend.add([
        {
          id: drawerId,
          document: body,
          metadata: { wing: w, room: r, added_by: by, filed_at: new Date().toISOString() },
        },
      ]);
      return { success: true, id: drawerId, wing: w, room: r };
    } catch (e) {
      return { success: false, error: errMsg(e) };
    }
  }

  delete(drawerId: string): { success: boolean; id?: string; error?: string } {
    if (!this.is_available()) {
      return { success: false, error: "Palace unavailable" };
    }
    try {
      this._wal_log("delete", { id: drawerId });
      this.backend.delete([drawerId]);
      return { success: true, id: drawerId };
    } catch (e) {
      return { success: false, error: errMsg(e) };
    }
  }

  /** camelCase aliases (additive). */
  isAvailable(): boolean {
    return this.is_available();
  }
  listWings(): { wings: Record<string, number> } {
    return this.list_wings();
  }
  listRooms(wing?: string | null): { wing?: string; rooms: Record<string, number>; error?: string } {
    return this.list_rooms(wing);
  }
  getContext(): string {
    return this.get_context();
  }
  traverseGraph(startRoom: string, maxHops = 2): unknown {
    return this.traverse_graph(startRoom, maxHops);
  }
  findTunnels(wingA?: string | null, wingB?: string | null): unknown {
    return this.find_tunnels(wingA, wingB);
  }
  graphStats(): unknown {
    return this.graph_stats();
  }
  checkDuplicate(content: string, threshold = 0.9): { is_duplicate: boolean; matches?: Array<Record<string, unknown>>; error?: string } {
    return this.check_duplicate(content, threshold);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * Knowledge graph (temporal facts: subject → predicate → object)
 * ════════════════════════════════════════════════════════════════════════════ */

export interface KGTriple {
  subject: string;
  predicate: string;
  object: string;
  valid_from: string | null;
  valid_to: string | null;
  current: number;
}

export interface KGAddOptions {
  valid_from?: string | null;
  source?: string | null;
}

/**
 * SQLite temporal knowledge graph — this is the Python `_MinimalKG` schema and
 * SQL, promoted to the only implementation because the mempalace
 * `KnowledgeGraph` source is not in the reference tree.
 * `as_of` filtering is honoured (documented deviation from `_MinimalKG`, which
 * accepted but ignored it; the real mempalace class honoured it).
 */
export class SqliteKnowledgeGraph {
  readonly db_path: string;
  protected _conn: DatabaseSync;

  constructor(dbPath: string = KG_PATH) {
    this.db_path = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this._conn = new DatabaseSync(dbPath);
    this._conn.exec("PRAGMA journal_mode=WAL");
    this._conn.exec(
      `CREATE TABLE IF NOT EXISTS triples (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         subject TEXT, predicate TEXT, object TEXT,
         valid_from TEXT, valid_until TEXT, source TEXT,
         created_at TEXT DEFAULT CURRENT_TIMESTAMP
       )`,
    );
    this._conn.exec("CREATE INDEX IF NOT EXISTS idx_s ON triples(subject)");
  }

  add_triple(
    subject: string,
    predicate: string,
    obj: string,
    validFrom: string | null = null,
    sourceCloset: string | null = null,
  ): string {
    const res = this._conn
      .prepare("INSERT INTO triples(subject,predicate,object,valid_from,source) VALUES(?,?,?,?,?)")
      .run(subject, predicate, obj, validFrom, sourceCloset);
    return String(res.lastInsertRowid);
  }

  query_entity(name: string, asOf: string | null = null, direction = "both"): KGTriple[] {
    const rows: KGTriple[] = [];
    const temporal = asOf
      ? " AND (valid_from IS NULL OR valid_from <= ?) AND (valid_until IS NULL OR valid_until > ?)"
      : "";
    const sqlFor = (column: string): string =>
      `SELECT subject, predicate, object, valid_from, valid_until,
              CASE WHEN valid_until IS NULL THEN 1 ELSE 0 END AS current
       FROM triples WHERE ${column} = ?${temporal}`;

    if (direction === "outgoing" || direction === "both") {
      const params: Array<string> = [name];
      if (asOf) params.push(asOf, asOf);
      rows.push(...(this._conn.prepare(sqlFor("subject")).all(...params) as unknown as KGTriple[]).map(normalizeTriple));
    }
    if (direction === "incoming" || direction === "both") {
      const params: Array<string> = [name];
      if (asOf) params.push(asOf, asOf);
      rows.push(...(this._conn.prepare(sqlFor("object")).all(...params) as unknown as KGTriple[]).map(normalizeTriple));
    }
    return rows;
  }

  invalidate(subject: string, predicate: string, obj: string, ended: string | null = null): void {
    const end = ended ?? formatDate(new Date());
    this._conn
      .prepare(
        "UPDATE triples SET valid_until=? WHERE subject=? AND predicate=? AND object=? AND valid_until IS NULL",
      )
      .run(end, subject, predicate, obj);
  }

  timeline(entityName: string | null = null): Array<Record<string, unknown>> {
    const sql =
      "SELECT subject,predicate,object,valid_from,valid_until FROM triples" +
      (entityName ? " WHERE subject=? OR object=?" : "") +
      " ORDER BY created_at";
    const rows = (entityName
      ? this._conn.prepare(sql).all(entityName, entityName)
      : this._conn.prepare(sql).all()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      subject: String(r["subject"] ?? ""),
      predicate: String(r["predicate"] ?? ""),
      object: String(r["object"] ?? ""),
      valid_from: r["valid_from"] === null || r["valid_from"] === undefined ? null : String(r["valid_from"]),
      valid_to: r["valid_until"] === null || r["valid_until"] === undefined ? null : String(r["valid_until"]),
    }));
  }

  stats(): { total_triples: number; active_triples: number } {
    const total = Number(
      (this._conn.prepare("SELECT COUNT(*) AS n FROM triples").get() as Record<string, unknown>)["n"] ?? 0,
    );
    const active = Number(
      (
        this._conn.prepare("SELECT COUNT(*) AS n FROM triples WHERE valid_until IS NULL").get() as Record<
          string,
          unknown
        >
      )["n"] ?? 0,
    );
    return { total_triples: total, active_triples: active };
  }

  close(): void {
    try {
      this._conn.close();
    } catch {
      /* ignore */
    }
  }
}

function normalizeTriple(row: unknown): KGTriple {
  const r = row as Record<string, unknown>;
  return {
    subject: String(r["subject"] ?? ""),
    predicate: String(r["predicate"] ?? ""),
    object: String(r["object"] ?? ""),
    valid_from: r["valid_from"] === null || r["valid_from"] === undefined ? null : String(r["valid_from"]),
    valid_to: r["valid_until"] === null || r["valid_until"] === undefined ? null : String(r["valid_until"]),
    current: Number(r["current"] ?? 0),
  };
}

/** `datetime.now().strftime("%Y-%m-%d")` in local time. */
export function formatDate(d: Date): string {
  const p = (x: number): string => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Wraps the temporal knowledge graph stored at AXONIZ_HOME.
 * Keeps the Python method names/return shapes (`add`, `query`, `invalidate`,
 * `timeline`, `stats`); the tuple-style keyword arguments are also accepted as
 * an options object.
 */
export class KnowledgeGraphLayer {
  protected _kg_path: string;
  protected _kg: SqliteKnowledgeGraph | null = null;

  constructor(kgPath: string = KG_PATH) {
    this._kg_path = kgPath;
  }

  _get(): SqliteKnowledgeGraph {
    if (this._kg === null) {
      this._kg = new SqliteKnowledgeGraph(this._kg_path);
    }
    return this._kg;
  }

  add(
    subject: string,
    predicate: string,
    obj: string,
    validFromOrOptions?: string | KGAddOptions | null,
    source?: string | null,
  ): string {
    let validFrom: string | null = null;
    let src: string | null = null;
    if (validFromOrOptions !== null && typeof validFromOrOptions === "object") {
      validFrom = validFromOrOptions.valid_from ?? null;
      src = validFromOrOptions.source ?? null;
    } else {
      validFrom = validFromOrOptions ?? null;
      src = source ?? null;
    }
    try {
      return this._get().add_triple(subject, predicate, obj, validFrom, src);
    } catch (e) {
      return `[KG error] ${errMsg(e)}`;
    }
  }

  query(
    entity: string,
    asOfOrOptions?: string | { as_of?: string | null; direction?: string } | null,
    direction = "both",
  ): KGTriple[] {
    let asOf: string | null = null;
    let dir = direction;
    if (asOfOrOptions !== null && typeof asOfOrOptions === "object") {
      asOf = asOfOrOptions.as_of ?? null;
      dir = asOfOrOptions.direction ?? "both";
    } else {
      asOf = asOfOrOptions ?? null;
    }
    try {
      return this._get().query_entity(entity, asOf, dir);
    } catch (e) {
      return [{ error: errMsg(e) } as unknown as KGTriple];
    }
  }

  invalidate(
    subject: string,
    predicate: string,
    obj: string,
    ended?: string | { ended?: string | null } | null,
  ): void {
    const end = ended !== null && typeof ended === "object" ? (ended.ended ?? null) : (ended ?? null);
    try {
      this._get().invalidate(subject, predicate, obj, end);
    } catch {
      /* Python swallows invalidate errors */
    }
  }

  timeline(entity?: string | { entity?: string | null } | null): Array<Record<string, unknown>> {
    const name = entity !== null && typeof entity === "object" ? (entity.entity ?? null) : (entity ?? null);
    try {
      return this._get().timeline(name);
    } catch (e) {
      return [{ error: errMsg(e) }];
    }
  }

  stats(): Record<string, unknown> {
    try {
      return this._get().stats();
    } catch (e) {
      return { error: errMsg(e) };
    }
  }

  close(): void {
    try {
      this._kg?.close();
    } catch {
      /* ignore */
    }
    this._kg = null;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * AgentDiary — AAAK diary stored in the palace
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The agent's personal journal, stored in the palace.
 * Each agent gets wing_<name>/diary, with AAAK-compressed entries.
 */
export class AgentDiary {
  static readonly AAAK_SPEC =
    "AAAK: compressed memory dialect. " +
    "ENTITIES: 3-letter codes. EMOTIONS: *warm* *fierce* *raw* *bloom*. " +
    "STRUCTURE: SESSION:DATE|TOPIC:tag|entry. ★ to ★★★★★. " +
    "HALLS: hall_facts hall_events hall_decisions hall_diary. " +
    "WINGS: wing_user wing_agent wing_code wing_project. " +
    "ROOMS: hyphenated-slugs.";

  palace: PalaceLayer;
  agent_name: string;
  protected _wing: string;
  protected _room = "diary";

  constructor(palace: PalaceLayer, agentName = "axoniz-zero") {
    this.palace = palace;
    this.agent_name = agentName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    this._wing = `wing_${this.agent_name}`;
  }

  write(entry: string, topic = "general"): PalaceStoreResult {
    const now = formatDate(new Date());
    const content = `SESSION:${now}|TOPIC:${topic}|${entry}`;
    return this.palace.store(this._wing, this._room, content, this.agent_name);
  }

  read(lastN = 10): PalaceSearchResult {
    return this.palace.search("SESSION TOPIC diary", this._wing, this._room, lastN);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * UnifiedMemory — the single object Agent uses
 * ════════════════════════════════════════════════════════════════════════════ */

export type ToolFn = (...args: any[]) => unknown;
export type ToolMap = Record<string, ToolFn>;

export interface UnifiedMemoryConfig {
  agent_name?: string;
  palace_path?: string;
  kg_path?: string;
  [key: string]: unknown;
}

/**
 * Drop-in replacement for `axoniz.core.memory.SemanticMemory` used by Agent.
 *
 * Combines:
 *   1. SemanticMemory      — TF-IDF, always-on, no deps (from src/core/memory.ts)
 *   2. PalaceLayer         — local SQLite palace (wings/rooms/drawers)
 *   3. KnowledgeGraphLayer — temporal KG (SQLite)
 *   4. AgentDiary          — AAAK journal stored in the palace
 *
 * Hermes MemoryManager patterns used:
 *   - context fencing (_build_memory_context_block)
 *   - prefetch/sync_turn lifecycle
 *   - single provider limit enforced (palace replaces mempalace_bridge)
 */
export class UnifiedMemory {
  builtin: SemanticMemory;
  palace: PalaceLayer;
  kg: KnowledgeGraphLayer;
  diary: AgentDiary;
  protected _prefetch_cache = "";

  constructor(config: Record<string, unknown> | UnifiedMemoryConfig = {}) {
    const agentName = String(config["agent_name"] ?? "axoniz-zero");
    const palacePath = String(config["palace_path"] ?? PALACE_PATH);
    const kgPath = String(config["kg_path"] ?? KG_PATH);

    // 1. Always-on local memory (TF-IDF, zero deps)
    this.builtin = new SemanticMemory(MEMORY_PATH);

    // 2. Palace (local SQLite backend; embeddings pluggable)
    this.palace = new PalaceLayer(palacePath);

    // 3. Knowledge graph
    this.kg = new KnowledgeGraphLayer(kgPath);

    // 4. Diary
    this.diary = new AgentDiary(this.palace, agentName);

    // Hermes: prefetch cache for the next turn
    logger.info(
      `[UnifiedMemory] ready | palace=${palacePath} | kg=${kgPath} | palace_enabled=${this.palace.is_available()}`,
    );
  }

  /* ── SemanticMemory drop-in interface ───────────────────────────────────── */

  save(key: string, value: string, tags?: string[] | null, importance = 0.5): string {
    const result = this.builtin.save(key, value, tags ?? undefined, importance);
    if (this.palace.is_available()) {
      const wing = tags && tags.length > 0 ? tags[0] : "general";
      this.palace.store(wing, "memory", `${key}: ${value}`, "axoniz");
    }
    return result;
  }

  get(key: string): string {
    const local = this.builtin.get(key);
    if (!local.includes("not found in memory.")) {
      return local;
    }
    if (this.palace.is_available()) {
      const r = this.palace.search(key, null, null, 1);
      const items = r.results;
      if (items.length > 0) {
        return items[0].text;
      }
    }
    return local;
  }

  delete(key: string): string {
    return this.builtin.delete(key);
  }

  clear(): void {
    this.builtin.clear();
  }

  all(): Record<string, string> {
    return this.builtin.all();
  }

  all_rich(): Record<string, unknown> {
    return this.builtin.allRich() as unknown as Record<string, unknown>;
  }

  allRich(): Record<string, unknown> {
    return this.all_rich();
  }

  list_keys(): string {
    const local = this.builtin.listKeys();
    if (this.palace.is_available()) {
      const wings = this.palace.list_wings().wings;
      const entries = Object.entries(wings);
      if (entries.length > 0) {
        const wingStr = entries.map(([w, c]) => `${w}(${c})`).join(", ");
        return `${local}\n\n[Palace wings]: ${wingStr}`;
      }
    }
    return local;
  }

  listKeys(): string {
    return this.list_keys();
  }

  search(query: string, topK = 5): Array<[string, string, number]> {
    return this.builtin.search(query, topK);
  }

  /**
   * Build the context block injected into the system prompt.
   * Hermes pattern: fenced block, prefetch from the palace.
   */
  get_relevant_context(query: string, maxTokens = 800): string {
    const parts: string[] = [];

    // Prefetch cache from the previous turn (Hermes pattern)
    const cached = this._prefetch_cache;

    if (cached) {
      parts.push(cached);
    } else if (this.palace.is_available()) {
      // Live fetch when there is no cache yet
      const ctx = this.palace.get_context();
      if (ctx) {
        parts.push(ctx);
      }
      const r = this.palace.search(query, null, null, 3);
      const hits = r.results;
      if (hits.length > 0) {
        const lines = ["[PALACE SEARCH]"];
        for (const h of hits) {
          lines.push(`  [${h.wing}/${h.room}] ${h.text.slice(0, 200)}`);
        }
        parts.push(lines.join("\n"));
      }
    }

    // Always include TF-IDF local memory too
    const localCtx = this.builtin.getRelevantContext(query, Math.floor(maxTokens / 2));
    if (localCtx) {
      parts.push(localCtx);
    }

    if (parts.length === 0) {
      return "";
    }

    return _build_memory_context_block(parts.join("\n\n"));
  }

  getRelevantContext(query: string, maxTokens = 800): string {
    return this.get_relevant_context(query, maxTokens);
  }

  auto_extract_and_save(text: string, source = "conversation"): void {
    this.builtin.autoExtractAndSave(text, source);
    if (this.palace.is_available() && text.length > 50) {
      this.palace.store("wing_axoniz", "conversations", text.slice(0, 600), "auto");
    }
  }

  autoExtractAndSave(text: string, source = "conversation"): void {
    this.auto_extract_and_save(text, source);
  }

  /* ── Hermes lifecycle hooks ─────────────────────────────────────────────── */

  /**
   * Called before each agent turn — refreshes the cached palace context.
   * Python used a daemon thread; this is a fire-and-forget async task that is
   * also awaitable and never rejects.
   */
  async prefetch(query: string): Promise<void> {
    if (!this.palace.is_available()) {
      return;
    }
    try {
      const parts: string[] = [];
      const ctx = this.palace.get_context();
      if (ctx) {
        parts.push(ctx);
      }
      const r = this.palace.search(query, null, null, 4);
      const hits = r.results;
      if (hits.length > 0) {
        const lines = ["[PALACE]"];
        for (const h of hits) {
          lines.push(`  [${h.wing}/${h.room}] ${h.text.slice(0, 150)}`);
        }
        parts.push(lines.join("\n"));
      }
      this._prefetch_cache = parts.join("\n\n");
    } catch (e) {
      logger.debug(`[UnifiedMemory] prefetch failed: ${errMsg(e)}`);
    }
  }

  /** Called after each turn — saves the conversation to the palace. */
  async sync_turn(userContent: string, assistantContent: string): Promise<void> {
    if (!this.palace.is_available()) {
      return;
    }
    try {
      this.palace.store(
        "wing_axoniz",
        "conversation-log",
        `USR: ${userContent.slice(0, 300)}\nAGT: ${assistantContent.slice(0, 300)}`,
        "sync",
      );
    } catch (e) {
      logger.debug(`[UnifiedMemory] sync_turn failed: ${errMsg(e)}`);
    }
  }

  syncTurn(userContent: string, assistantContent: string): Promise<void> {
    return this.sync_turn(userContent, assistantContent);
  }

  /* ── Tool map — injected into Agent._tool_map ───────────────────────────── */

  /**
   * Callable tools to merge into the agent tool map.
   * Overrides memory_save/get/list with the unified versions and adds
   * palace/kg/diary tools. Key names match the Python exactly, and each callable
   * accepts the Python kwargs object the agent dispatches (`fn(args)`) as well
   * as plain positional arguments.
   */
  as_tool_map(): ToolMap {
    return {
      // ── Override existing axoniz memory tools ──
      memory_save: (...args: any[]) => {
        const a = toolArgs(args, ["key", "value", "tags", "importance"]);
        return this.save(
          String(a["key"] ?? ""),
          String(a["value"] ?? ""),
          a["tags"] as string[] | undefined,
          optNum(a["importance"]) ?? 0.5,
        );
      },
      memory_get: (...args: any[]) => {
        const a = toolArgs(args, ["key"]);
        return this.get(String(a["key"] ?? ""));
      },
      memory_list: () => this.list_keys(),

      // ── Palace read tools ──
      palace_search: (...args: any[]) => {
        const a = toolArgs(args, ["query", "wing", "room", "limit"]);
        return this._t_palace_search(String(a["query"] ?? ""), optStr(a["wing"]), optStr(a["room"]), optNum(a["limit"]));
      },
      palace_context: () => this._t_palace_context(),
      palace_status: () => this._t_palace_status(),
      palace_wings: () => this._t_palace_wings(),
      palace_rooms: (...args: any[]) => {
        const a = toolArgs(args, ["wing"]);
        return this._t_palace_rooms(optStr(a["wing"]));
      },
      palace_check_dup: (...args: any[]) => {
        const a = toolArgs(args, ["content", "threshold"]);
        return this._t_palace_check_dup(String(a["content"] ?? ""), optNum(a["threshold"]) ?? 0.9);
      },
      palace_graph_traverse: (...args: any[]) => {
        const a = toolArgs(args, ["start_room", "max_hops"]);
        return this._t_palace_traverse(String(a["start_room"] ?? ""), optNum(a["max_hops"]) ?? 2);
      },
      palace_find_tunnels: (...args: any[]) => {
        const a = toolArgs(args, ["wing_a", "wing_b"]);
        return this._t_palace_tunnels(optStr(a["wing_a"]), optStr(a["wing_b"]));
      },
      palace_graph_stats: () => this._t_palace_graph_stats(),

      // ── Palace write tools ──
      palace_store: (...args: any[]) => {
        const a = toolArgs(args, ["wing", "room", "content"]);
        return this._t_palace_store(String(a["wing"] ?? ""), String(a["room"] ?? ""), String(a["content"] ?? ""));
      },
      palace_delete: (...args: any[]) => {
        const a = toolArgs(args, ["drawer_id"]);
        return this._t_palace_delete(String(a["drawer_id"] ?? ""));
      },

      // ── Knowledge graph ──
      kg_add: (...args: any[]) => {
        const a = toolArgs(args, ["subject", "predicate", "obj", "valid_from", "source"]);
        return this._t_kg_add(
          String(a["subject"] ?? ""),
          String(a["predicate"] ?? ""),
          String(a["obj"] ?? ""),
          optStr(a["valid_from"]),
          optStr(a["source"]),
        );
      },
      kg_query: (...args: any[]) => {
        const a = toolArgs(args, ["entity", "as_of", "direction"]);
        return this._t_kg_query(String(a["entity"] ?? ""), optStr(a["as_of"]), optStr(a["direction"]) ?? "both");
      },
      kg_invalidate: (...args: any[]) => {
        const a = toolArgs(args, ["subject", "predicate", "obj", "ended"]);
        return this._t_kg_invalidate(
          String(a["subject"] ?? ""),
          String(a["predicate"] ?? ""),
          String(a["obj"] ?? ""),
          optStr(a["ended"]),
        );
      },
      kg_timeline: (...args: any[]) => {
        const a = toolArgs(args, ["entity"]);
        return this._t_kg_timeline(optStr(a["entity"]));
      },
      kg_stats: () => this._t_kg_stats(),

      // ── Agent diary ──
      diary_write: (...args: any[]) => {
        const a = toolArgs(args, ["entry", "topic"]);
        return this._t_diary_write(String(a["entry"] ?? ""), optStr(a["topic"]) ?? "general");
      },
      diary_read: (...args: any[]) => {
        const a = toolArgs(args, ["last_n"]);
        return this._t_diary_read(optNum(a["last_n"]) ?? 10);
      },
    };
  }

  asToolMap(): ToolMap {
    return this.as_tool_map();
  }

  /** OpenAI-format schemas for all memory tools — used in TOOL_SCHEMAS. */
  as_tool_schemas(): Array<Record<string, unknown>> {
    return [
      _fn(
        "palace_search",
        "Semantic search across the palace. Use before answering questions about past decisions, projects, or context. Returns verbatim stored content.",
        {
          query: ["string", "Search query"],
          wing: ["string", "Wing filter (optional)"],
          room: ["string", "Room filter (optional)"],
          limit: ["integer", "Max results (default 5)"],
        },
        ["query"],
      ),
      _fn(
        "palace_store",
        "Save verbatim content into the palace. wing=domain (project/person/topic), room=sub-topic.",
        {
          wing: ["string", "Domain (e.g. project name)"],
          room: ["string", "Sub-topic"],
          content: ["string", "Verbatim content to store"],
        },
        ["wing", "room", "content"],
      ),
      _fn(
        "palace_context",
        "Load palace wake-up context: total drawers, wings overview. Call at start of session.",
        {},
        [],
      ),
      _fn("palace_wings", "List all palace wings and drawer counts.", {}, []),
      _fn("palace_rooms", "List rooms in a wing.", { wing: ["string", "Wing name"] }, []),
      _fn(
        "palace_check_dup",
        "Check if content already exists before storing.",
        {
          content: ["string", "Content to check"],
          threshold: ["number", "Similarity threshold 0-1 (default 0.9)"],
        },
        ["content"],
      ),
      _fn("palace_delete", "Delete a palace drawer by ID.", { drawer_id: ["string", "Drawer ID"] }, ["drawer_id"]),
      _fn(
        "palace_graph_traverse",
        "Walk palace graph from a room — find connected ideas across wings.",
        {
          start_room: ["string", "Room to start from"],
          max_hops: ["integer", "Hops to follow (default 2)"],
        },
        ["start_room"],
      ),
      _fn(
        "palace_find_tunnels",
        "Find rooms that bridge two wings.",
        { wing_a: ["string", "First wing"], wing_b: ["string", "Second wing"] },
        [],
      ),
      _fn("palace_graph_stats", "Palace graph overview: rooms, tunnels, edges.", {}, []),
      _fn(
        "kg_add",
        "Add a temporal fact: subject → predicate → object. E.g. ('Max','loves','chess',valid_from='2025-01-01')",
        {
          subject: ["string", "Entity"],
          predicate: ["string", "Relationship"],
          obj: ["string", "Connected entity"],
          valid_from: ["string", "When true (YYYY-MM-DD)"],
          source: ["string", "Source reference"],
        },
        ["subject", "predicate", "obj"],
      ),
      _fn(
        "kg_query",
        "Query knowledge graph for an entity's facts. direction: outgoing/incoming/both.",
        {
          entity: ["string", "Entity name"],
          as_of: ["string", "Date filter YYYY-MM-DD"],
          direction: ["string", "outgoing/incoming/both"],
        },
        ["entity"],
      ),
      _fn(
        "kg_invalidate",
        "Mark a fact as no longer true.",
        {
          subject: ["string", ""],
          predicate: ["string", ""],
          obj: ["string", ""],
          ended: ["string", "When it ended YYYY-MM-DD"],
        },
        ["subject", "predicate", "obj"],
      ),
      _fn("kg_timeline", "Chronological timeline of facts.", { entity: ["string", "Entity name (optional)"] }, []),
      _fn("kg_stats", "Knowledge graph statistics.", {}, []),
      _fn(
        "diary_write",
        "Write a diary entry in AAAK format. Your personal journal across sessions.",
        { entry: ["string", "AAAK-format diary entry"], topic: ["string", "Topic tag (optional)"] },
        ["entry"],
      ),
      _fn("diary_read", "Read your recent diary entries.", { last_n: ["integer", "Number of entries (default 10)"] }, []),
    ];
  }

  asToolSchemas(): Array<Record<string, unknown>> {
    return this.as_tool_schemas();
  }

  /* ── Tool implementations ───────────────────────────────────────────────── */

  _t_palace_search(query: string, wing?: string | null, room?: string | null, limit = 5): string {
    const r = this.palace.search(query, wing ?? null, room ?? null, limit);
    if (r.error !== undefined && r.results.length === 0) {
      return `[Palace error] ${r.error}`;
    }
    const hits = r.results;
    if (hits.length === 0) {
      return `No palace results for: ${query}`;
    }
    const lines = [`Palace search: '${query}' (${hits.length} results)`];
    for (const h of hits) {
      lines.push(`  [${h.wing}/${h.room}] sim=${h.similarity} | ${h.text.slice(0, 200)}`);
    }
    return lines.join("\n");
  }

  _t_palace_store(wing: string, room: string, content: string): string {
    return JSON.stringify(this.palace.store(wing, room, content, "agent"));
  }

  _t_palace_context(): string {
    const st = this.palace.status();
    if (st.error !== undefined && st.total_drawers === 0) {
      return "[Palace empty or unavailable. Local SQLite palace backend is not initialized.]";
    }
    const lines = [
      `Palace status: ${st.total_drawers} drawers`,
      "Wings: " +
        Object.entries(st.wings ?? {})
          .slice(0, 8)
          .map(([w, c]) => `${w}(${c})`)
          .join(", "),
    ];
    return lines.join("\n");
  }

  _t_palace_status(): string {
    return JSON.stringify(this.palace.status(), null, 2);
  }

  _t_palace_wings(): string {
    return JSON.stringify(this.palace.list_wings(), null, 2);
  }

  _t_palace_rooms(wing?: string | null): string {
    return JSON.stringify(this.palace.list_rooms(wing ?? null), null, 2);
  }

  _t_palace_check_dup(content: string, threshold = 0.9): string {
    return JSON.stringify(this.palace.check_duplicate(content, threshold), null, 2);
  }

  _t_palace_delete(drawerId: string): string {
    return JSON.stringify(this.palace.delete(drawerId), null, 2);
  }

  _t_palace_traverse(startRoom: string, maxHops = 2): string {
    return JSON.stringify(this.palace.traverse_graph(startRoom, maxHops), null, 2);
  }

  _t_palace_tunnels(wingA?: string | null, wingB?: string | null): string {
    return JSON.stringify(this.palace.find_tunnels(wingA ?? null, wingB ?? null), null, 2);
  }

  _t_palace_graph_stats(): string {
    return JSON.stringify(this.palace.graph_stats(), null, 2);
  }

  _t_kg_add(subject: string, predicate: string, obj: string, validFrom?: string | null, source?: string | null): string {
    const result = this.kg.add(subject, predicate, obj, validFrom ?? null, source ?? null);
    return `Added: ${subject} → ${predicate} → ${obj} | id=${result}`;
  }

  _t_kg_query(entity: string, asOf?: string | null, direction = "both"): string {
    const facts = this.kg.query(entity, asOf ?? null, direction);
    if (facts.length === 0) {
      return `No facts found for: ${entity}`;
    }
    const lines = [`KG facts for '${entity}':`];
    for (const f of facts.slice(0, 20)) {
      const status = f.current ? "✓" : "✗";
      lines.push(
        `  ${status} ${f.subject} → ${f.predicate} → ${f.object} [${f.valid_from ?? ""}→${f.valid_to ?? ""}]`,
      );
    }
    return lines.join("\n");
  }

  _t_kg_invalidate(subject: string, predicate: string, obj: string, ended?: string | null): string {
    this.kg.invalidate(subject, predicate, obj, ended ?? null);
    return `Invalidated: ${subject} → ${predicate} → ${obj} (ended: ${ended ?? "today"})`;
  }

  _t_kg_timeline(entity?: string | null): string {
    const facts = this.kg.timeline(entity ?? null);
    if (facts.length === 0) {
      return "No timeline entries.";
    }
    const lines = [`Timeline${entity ? ` for ${entity}` : ""}:`];
    for (const f of facts.slice(0, 20)) {
      lines.push(
        `  ${f["valid_from"] ?? "?"} | ${f["subject"] ?? ""} → ${f["predicate"] ?? ""} → ${f["object"] ?? ""} ` +
          `${f["valid_to"] ? "(expired)" : ""}`,
      );
    }
    return lines.join("\n");
  }

  _t_kg_stats(): string {
    return JSON.stringify(this.kg.stats(), null, 2);
  }

  _t_diary_write(entry: string, topic = "general"): string {
    const r = this.diary.write(entry, topic);
    return `Diary entry saved: ${r.id ?? JSON.stringify(r)}`;
  }

  /**
   * `last_n` may be passed positionally (tool map) or as `{ last_n }` — the
   * Python CLI calls it as `memory._t_diary_read(last_n=1)`.
   */
  _t_diary_read(lastN: number | { last_n?: number } = 10): string {
    const n = typeof lastN === "object" && lastN !== null ? (lastN.last_n ?? 10) : lastN;
    const r = this.diary.read(n);
    const hits = r.results;
    if (hits.length === 0) {
      return "No diary entries yet.";
    }
    const lines = ["Recent diary entries:"];
    for (const h of hits) {
      lines.push(`  ${h.text.slice(0, 300)}`);
    }
    return lines.join("\n");
  }

  /** Close the underlying SQLite handles (additive; Python had no explicit close). */
  close(): void {
    this.palace.backend.close();
    this.kg.close();
  }
}

/* ── Helper: build an OpenAI function schema ───────────────────────────────── */

export type SchemaProps = Record<string, [string, string] | [string] | Record<string, unknown>>;

export function _fn(
  name: string,
  description: string,
  props: SchemaProps,
  required: string[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (Array.isArray(v)) {
      const prop: Record<string, unknown> = { type: v[0] };
      if (v[1]) prop["description"] = v[1];
      properties[k] = prop;
    } else {
      properties[k] = v;
    }
  }
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}
