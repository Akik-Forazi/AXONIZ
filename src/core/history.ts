/**
 * AXONIZ-ZERO History — v2
 * Stores sessions in ~/.axoniz/history/ as JSONL files.
 * Supports saving/loading full chat history for conversation resume.
 * Port of axoniz/core/history.py.
 */
import fs from "node:fs";
import path from "node:path";
import { HISTORY_DIR } from "./config.js";
import type { Backend, ChatMessage } from "./backend/index.js";

export interface SessionMeta {
  title: string;
  file: string;
  ts: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  ts: string;
  count: number;
}

export interface HistoryEntry {
  ts: string;
  role: string;
  content: string;
  [key: string]: unknown;
}

/** ISO-8601 local timestamp with `YYYYMMDD_HHMMSS` filename form. */
function stamp(): { iso: string; compact: string } {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const compact =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const iso =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return { iso, compact };
}

export class ChatHistory {
  private readonly file: string;
  private session: ChatMessage[] = [];
  private title = "";

  constructor() {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const { compact } = stamp();
    this.file = path.join(HISTORY_DIR, `session_${compact}.jsonl`);
  }

  get filePath(): string {
    return this.file;
  }

  /** Append a raw log entry (persisted to JSONL). */
  append(role: string, content: string, meta: Record<string, unknown> = {}): void {
    const entry = { ts: stamp().iso, role, content, ...meta };
    try {
      fs.appendFileSync(this.file, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      /* best effort */
    }
  }

  /* ── In-memory session (LLM context window) ────────────────────────────── */

  appendSession(msg: ChatMessage): void {
    this.session.push(msg);
    // Capture the first user message as the display title.
    if (!this.title && msg.role === "user") {
      this.title = String(msg.content ?? "").slice(0, 60);
      this.writeMeta();
    }
  }

  getSession(): ChatMessage[] {
    return [...this.session];
  }

  /**
   * Compress the current session context into a concise executive summary.
   * Safe version for 3B models.
   */
  async distill(backend: Backend): Promise<string> {
    if (this.session.length < 6) return "";

    const turns: string[] = [];
    for (const m of this.session) {
      const role = String(m.role ?? "user").toUpperCase();
      const content = String(m.content ?? "");
      // Never summarize previous summaries — that loses data.
      if (content.includes("System'S EXECUTIVE SUMMARY")) continue;
      turns.push(`${role}: ${content.slice(0, 200)}`);
    }

    const prompt =
      "SYSTEM: You are a Cognitive Distiller.\n" +
      "TASK: Summarize the conversation history into 3 short bullet points.\n" +
      "HISTORY:\n" +
      turns.slice(-10).join("\n") +
      "\n\nSUMMARY:";

    try {
      const result = await backend.complete(
        [{ role: "user", content: prompt }],
        200,
      );
      const summary = result.kind === "text" ? result.text : "";
      if (summary && summary.length > 10) {
        const systemPrompt =
          this.session.length > 0 && this.session[0].role === "system"
            ? this.session[0]
            : null;

        this.session = [];
        if (systemPrompt) this.session.push(systemPrompt);
        this.session.push({
          role: "system",
          content: `System'S EXECUTIVE SUMMARY (CONTEXT DISTILLATION):\n${summary}`,
        });
        if (turns.length > 0) {
          this.session.push({ role: "user", content: "[CONTINUING FROM SUMMARY]" });
        }
        return summary;
      }
    } catch {
      // Fallback: aggressive slice.
      if (this.session.length > 4) {
        this.session = [this.session[0], ...this.session.slice(-3)];
      }
      return "[FALLBACK DISTILLATION APPLIED]";
    }
    return "";
  }

  clearSession(): void {
    this.session = [];
  }

  /* ── Metadata ──────────────────────────────────────────────────────────── */

  private metaPath(): string {
    return this.file.replace(/\.jsonl$/, ".meta.json");
  }

  private writeMeta(): void {
    try {
      fs.writeFileSync(
        this.metaPath(),
        JSON.stringify({ title: this.title, file: path.basename(this.file), ts: stamp().iso }),
        "utf-8",
      );
    } catch {
      /* best effort */
    }
  }

  /* ── Session listing ───────────────────────────────────────────────────── */

  /** Return session dicts with id, title, ts, message count. */
  getSessions(): SessionInfo[] {
    try {
      const files = fs
        .readdirSync(HISTORY_DIR)
        .filter((f) => f.endsWith(".jsonl"))
        .sort((a, b) => b.localeCompare(a));

      const sessions: SessionInfo[] = [];
      for (const fname of files.slice(0, 100)) {
        const p = path.join(HISTORY_DIR, fname);
        const metaPath = p.replace(/\.jsonl$/, ".meta.json");
        let title = fname;
        let tsStr = "";
        let count = 0;

        // Prefer the metadata file (fast path).
        if (fs.existsSync(metaPath)) {
          try {
            const m = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Partial<SessionMeta>;
            title = m.title || fname;
            tsStr = m.ts ?? "";
          } catch {
            /* ignore */
          }
        }

        // Count lines and, failing metadata, derive a title from the first entry.
        try {
          const lines = fs.readFileSync(p, "utf-8").split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            count += 1;
            if (title === fname) {
              try {
                const entry = JSON.parse(line) as HistoryEntry;
                if (entry.role === "user") {
                  title = String(entry.content ?? "").slice(0, 60) || fname;
                }
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          /* ignore */
        }

        // Fall back to parsing the timestamp out of the filename.
        if (!tsStr) {
          const m = fname.match(/^session_(\d{8})_(\d{6})\.jsonl$/);
          if (m) {
            const [, d, t] = m;
            tsStr =
              `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` +
              `T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
          }
        }

        sessions.push({ id: fname, title, ts: tsStr, count });
      }
      return sessions;
    } catch {
      return [];
    }
  }

  /** Load all log entries from a session JSONL file. */
  loadSessionFile(filename: string): HistoryEntry[] {
    const p = path.join(HISTORY_DIR, filename);
    const entries: HistoryEntry[] = [];
    try {
      for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line) as HistoryEntry);
        } catch {
          /* skip malformed line */
        }
      }
    } catch {
      /* missing/unreadable file */
    }
    return entries;
  }

  /** Backwards-compatible alias. */
  loadSession(filename: string): HistoryEntry[] {
    return this.loadSessionFile(filename);
  }

  /** Delete a session file and its metadata. */
  deleteSession(filename: string): boolean {
    try {
      const p = path.join(HISTORY_DIR, filename);
      if (fs.existsSync(p)) fs.rmSync(p);
      const meta = p.replace(/\.jsonl$/, ".meta.json");
      if (fs.existsSync(meta)) fs.rmSync(meta);
      return true;
    } catch {
      return false;
    }
  }

  /** Update the metadata title for a session. */
  renameSession(filename: string, newTitle: string): boolean {
    try {
      const p = path.join(HISTORY_DIR, filename);
      if (!fs.existsSync(p)) return false;
      const metaPath = p.replace(/\.jsonl$/, ".meta.json");
      let meta: Record<string, unknown> = {};
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
        } catch {
          /* start fresh */
        }
      }
      meta.title = newTitle;
      meta.file = filename;
      if (!("ts" in meta)) meta.ts = stamp().iso;
      fs.writeFileSync(metaPath, JSON.stringify(meta), "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  /** Delete all session files. Returns the count deleted. */
  clearAllSessions(): number {
    let count = 0;
    try {
      for (const fname of fs.readdirSync(HISTORY_DIR)) {
        const p = path.join(HISTORY_DIR, fname);
        try {
          if (fs.statSync(p).isFile()) {
            fs.rmSync(p);
            count += 1;
          }
        } catch {
          /* ignore individual failures */
        }
      }
    } catch {
      /* ignore */
    }
    return count;
  }
}
