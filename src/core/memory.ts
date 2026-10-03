/**
 * AXONIZ-ZERO · Semantic Long-Term Memory
 * Works like Claude's memory or OpenClaw's long-term knowledge:
 * - Stores facts, preferences, context automatically
 * - Semantic search via keyword index (no external deps needed)
 * - Auto-summarises conversation context
 * - Tags, timestamps, importance scoring
 * - Survives across sessions, models, restarts
 * Port of axoniz/core/memory.py (hand-rolled TF-IDF, zero runtime deps).
 */
import fs from "node:fs";
import path from "node:path";
import { AXONIZ_HOME } from "./config.js";

export const MEMORY_PATH = path.join(AXONIZ_HOME, "memory.json");
export const CONTEXT_PATH = path.join(AXONIZ_HOME, "context.json");

const TOKEN_RE = /[a-z0-9_\-.]+/g;

/** Simple word tokenizer for keyword indexing. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

/** Lightweight TF-IDF similarity — no numpy needed. */
export function tfidfScore(
  queryTokens: string[],
  docTokens: string[],
  idf: Map<string, number>,
): number {
  if (docTokens.length === 0) return 0;
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const total = docTokens.length;
  let score = 0;
  for (const qt of queryTokens) {
    const count = tf.get(qt);
    if (count !== undefined) {
      const tfVal = count / total;
      const idfVal = idf.get(qt) ?? Math.log(10);
      score += tfVal * idfVal;
    }
  }
  return score;
}

export interface MemoryEntry {
  key: string;
  value: string;
  tags: string[];
  importance: number;
  created: number;
  accessed: number;
  hit_count: number;
  tokens: string[];
}

export type SearchResult = [key: string, value: string, score: number];

/**
 * Persistent, searchable long-term memory.
 * Each entry has: key, value, tags, importance (0-1), created, accessed, hit_count.
 */
export class SemanticMemory {
  readonly path: string;
  protected entries = new Map<string, MemoryEntry>();
  protected idf = new Map<string, number>();

  constructor(memoryPath: string = MEMORY_PATH) {
    this.path = memoryPath;
    this.load();
    this.rebuildIdf();
  }

  /* ── Persistence ───────────────────────────────────────────────────────── */

  private load(): void {
    if (!fs.existsSync(this.path)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.path, "utf-8")) as Record<string, unknown>;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const values = Object.values(data);
        const isFlat = values.length > 0 && values.every((v) => typeof v !== "object" || v === null);
        if (isFlat) {
          // Migrate the old flat key -> string format.
          for (const [k, v] of Object.entries(data)) {
            this.entries.set(k, this.makeEntry(k, String(v)));
          }
        } else {
          for (const [k, v] of Object.entries(data)) {
            this.entries.set(k, v as MemoryEntry);
          }
        }
      }
    } catch {
      this.entries = new Map();
    }
  }

  protected persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(Object.fromEntries(this.entries), null, 2), "utf-8");
    } catch {
      /* best effort, matching the Python's unguarded write semantics closely enough */
    }
  }

  protected makeEntry(key: string, value: string, tags?: string[], importance = 0.5): MemoryEntry {
    const now = Date.now() / 1000;
    return {
      key,
      value,
      tags: tags ?? this.autoTag(key, value),
      importance,
      created: now,
      accessed: now,
      hit_count: 0,
      tokens: tokenize(`${key} ${value}`),
    };
  }

  /** Heuristically tag entries. */
  protected autoTag(key: string, value: string): string[] {
    const tags: string[] = [];
    const combined = `${key} ${value}`.toLowerCase();
    const tagMap: Record<string, string[]> = {
      preference: ["prefer", "like", "want", "favorite", "love"],
      project: ["project", "repo", "codebase", "app", "api"],
      person: ["name", "user", "i am", "my name", "call me"],
      technical: ["python", "javascript", "code", "function", "class", "api", "database"],
      task: ["todo", "task", "need to", "should", "must", "build"],
    };
    for (const [tag, keywords] of Object.entries(tagMap)) {
      if (keywords.some((kw) => combined.includes(kw))) tags.push(tag);
    }
    return tags.length > 0 ? tags : ["general"];
  }

  /** Rebuild IDF scores from the current corpus. */
  protected rebuildIdf(): void {
    const N = Math.max(this.entries.size, 1);
    const df = new Map<string, number>();
    for (const entry of this.entries.values()) {
      const seen = new Set(entry.tokens ?? []);
      for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
    }
    this.idf = new Map();
    for (const [t, c] of df) this.idf.set(t, Math.log(N / (1 + c)));
  }

  /* ── Core CRUD ─────────────────────────────────────────────────────────── */

  save(key: string, value: string, tags?: string[], importance = 0.5): string {
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      existing.accessed = Date.now() / 1000;
      existing.tokens = tokenize(`${key} ${value}`);
      existing.importance = Math.max(existing.importance, importance);
      if (tags) existing.tags = [...new Set([...existing.tags, ...tags])];
    } else {
      this.entries.set(key, this.makeEntry(key, value, tags, importance));
    }
    this.persist();
    this.rebuildIdf();
    return `Saved to memory: '${key}'`;
  }

  get(key: string): string {
    const entry = this.entries.get(key);
    if (!entry) return `'${key}' not found in memory.`;
    entry.accessed = Date.now() / 1000;
    entry.hit_count = (entry.hit_count ?? 0) + 1;
    this.persist();
    return entry.value;
  }

  delete(key: string): string {
    if (!this.entries.has(key)) return `'${key}' not found.`;
    this.entries.delete(key);
    this.persist();
    this.rebuildIdf();
    return `Deleted '${key}' from memory.`;
  }

  clear(): void {
    this.entries.clear();
    this.persist();
  }

  /** Flat dict for backward compatibility. */
  all(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.entries) out[k] = v.value;
    return out;
  }

  allRich(): Record<string, MemoryEntry> {
    return Object.fromEntries(this.entries);
  }

  listKeys(): string {
    if (this.entries.size === 0) return "Memory is empty.";
    const lines = ["Stored memory:"];
    const sorted = [...this.entries.values()].sort(
      (a, b) => (b.importance ?? 0) - (a.importance ?? 0),
    );
    for (const v of sorted) {
      lines.push(`  [${(v.tags ?? []).join(", ")}] ${v.key}: ${v.value.slice(0, 80)}`);
    }
    return lines.join("\n");
  }

  /* ── Semantic search ───────────────────────────────────────────────────── */

  /** Return the top-k most relevant memories as [key, value, score]. */
  search(query: string, topK = 5): SearchResult[] {
    if (this.entries.size === 0) return [];
    const qTokens = tokenize(query);
    const scored: SearchResult[] = [];
    const now = Date.now() / 1000;

    for (const [key, entry] of this.entries) {
      const docTokens = entry.tokens ?? tokenize(`${key} ${entry.value}`);
      const score = tfidfScore(qTokens, docTokens, this.idf);
      const importanceBoost = entry.importance ?? 0.5;
      const ageDays = (now - (entry.accessed ?? now)) / 86400;
      const recencyBoost = 1 / (1 + ageDays * 0.1);
      const finalScore = score * (1 + importanceBoost) * recencyBoost;
      if (finalScore > 0) scored.push([key, entry.value, finalScore]);
    }

    scored.sort((a, b) => b[2] - a[2]);
    return scored.slice(0, topK);
  }

  /** Build a context block with the most relevant memories. */
  getRelevantContext(query: string, maxTokens = 800): string {
    const results = this.search(query, 8);
    if (results.length === 0) return "";
    const lines = ["[RELEVANT MEMORY]"];
    let charCount = 0;
    for (const [key, value] of results) {
      const line = `  ${key}: ${value}`;
      if (charCount + line.length > maxTokens) break;
      lines.push(line);
      charCount += line.length;
    }
    return lines.join("\n");
  }

  /**
   * Automatically extract and save facts from text.
   * Looks for patterns like "I am X", "my X is Y", "remember that X".
   */
  autoExtractAndSave(text: string, source = "conversation"): void {
    const patterns: Array<[RegExp, string, number]> = [
      [/(?:i am|i'm|my name is)\s+([a-z][a-z\s]{1,30})/g, "user_name", 0.9],
      [/(?:i prefer|i like|i use|i work with)\s+([a-z][a-z\s+#.]{1,40})/g, "user_preference", 0.7],
      [/(?:my project is|working on|building)\s+([a-z][a-z\s\-_]{1,40})/g, "current_project", 0.8],
      [/(?:remember that|note that|important:)\s+(.{10,120})/g, "note", 0.8],
      [/(?:i work at|i'm at|company is)\s+([a-z][a-z\s-]{1,40})/g, "workplace", 0.7],
    ];

    const textLower = text.toLowerCase();
    for (const [re, tag, importance] of patterns) {
      for (const m of textLower.matchAll(re)) {
        const val = (m[1] ?? "").trim().replace(/[.,;]+$/, "");
        if (val.length <= 2) continue;
        const key = `auto_${tag}_${Math.floor(Date.now() / 1000)}`;
        const existing = this.search(val, 1);
        if (existing.length === 0 || existing[0][2] < 0.5) {
          this.save(key, val, [tag, "auto", source], importance);
        }
      }
    }
  }
}

/** Alias so the agent import works (mirrors `Memory = SemanticMemory`). */
export const Memory = SemanticMemory;

/* ── Conversation context ────────────────────────────────────────────────── */

interface Turn {
  role: string;
  content: string;
  ts: number;
}

export interface ChatTurnMessage {
  role: string;
  content: string;
}

export class ConversationContext {
  static readonly MAX_FULL_TURNS = 20;
  static readonly MAX_SUMMARY_CHARS = 2000;

  readonly path: string;
  private turns: Turn[] = [];
  private summary = "";

  constructor(contextPath: string = CONTEXT_PATH) {
    this.path = contextPath;
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.path)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.path, "utf-8")) as {
        turns?: Turn[];
        summary?: string;
      };
      this.turns = data.turns ?? [];
      this.summary = data.summary ?? "";
    } catch {
      /* ignore corrupt context */
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(
        this.path,
        JSON.stringify({ turns: this.turns, summary: this.summary }),
        "utf-8",
      );
    } catch {
      /* ignore */
    }
  }

  add(role: string, content: string): void {
    this.turns.push({ role, content, ts: Date.now() / 1000 });
    if (this.turns.length > ConversationContext.MAX_FULL_TURNS * 2) this.compress();
    this.persist();
  }

  /** Move the oldest half into the extractive summary. */
  private compress(): void {
    const cutoff = this.turns.length - ConversationContext.MAX_FULL_TURNS;
    const old = this.turns.slice(0, cutoff);
    this.turns = this.turns.slice(cutoff);

    const userMsgs = old.filter((t) => t.role === "user").map((t) => t.content.slice(0, 200));
    const parts: string[] = [];
    if (this.summary) parts.push(this.summary);
    if (userMsgs.length > 0) {
      parts.push(`Earlier topics: ${userMsgs.slice(-5).join("; ")}`);
    }
    const joined = parts.join(" | ");
    this.summary = joined.slice(-ConversationContext.MAX_SUMMARY_CHARS);
  }

  /** Return the conversation as an OpenAI message list (no timestamps). */
  getMessages(): ChatTurnMessage[] {
    const msgs: ChatTurnMessage[] = [];
    if (this.summary) {
      msgs.push({ role: "system", content: `[CONVERSATION SUMMARY]\n${this.summary}` });
    }
    for (const t of this.turns.slice(-ConversationContext.MAX_FULL_TURNS)) {
      msgs.push({ role: t.role, content: t.content });
    }
    return msgs;
  }

  clear(): void {
    this.turns = [];
    this.summary = "";
    this.persist();
  }

  getRecent(n = 5): Turn[] {
    return this.turns.slice(-n);
  }
}
