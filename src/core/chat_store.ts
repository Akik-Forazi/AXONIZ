/**
 * AXONIZ-ZERO · Chat Store
 * Saves every conversation as a proper JSON file in ~/.axoniz/chats/
 * Format mirrors how ChatGPT stores conversations — each chat is one file:
 *
 *   ~/.axoniz/chats/<id>.json
 *   { id, title, model, created, updated, mode, messages: [...], pinned }
 *
 * Index file for fast listing:
 *   ~/.axoniz/chats/index.json — array of {id, title, model, created, updated, msg_count}
 *
 * Port of axoniz/core/chat_store.py.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AXONIZ_HOME } from "./config.js";

export const CHATS_DIR = path.join(AXONIZ_HOME, "chats");
export const INDEX_PATH = path.join(CHATS_DIR, "index.json");

fs.mkdirSync(CHATS_DIR, { recursive: true });

export interface ChatMessageRecord {
  role: string;
  content: string;
  ts: string;
  tool_calls?: unknown[];
  steps?: number;
  [key: string]: unknown;
}

export interface ChatRecord {
  id: string;
  title: string;
  model: string;
  created: string;
  updated: string;
  mode: string;
  messages: ChatMessageRecord[];
  pinned: boolean;
  [key: string]: unknown;
}

export interface ChatIndexEntry {
  id: string;
  title: string;
  model: string;
  created: string;
  updated: string;
  mode: string;
  msg_count: number;
  pinned: boolean;
  _match?: string;
  [key: string]: unknown;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function rand(n = 6): string {
  const bytes = crypto.randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Local ISO timestamp truncated to whole seconds (`timespec="seconds"`). */
function nowIso(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function chatPath(chatId: string): string {
  return path.join(CHATS_DIR, `${chatId}.json`);
}

/* ── Index helpers ────────────────────────────────────────────────────────── */

function loadIndex(): ChatIndexEntry[] {
  try {
    const data = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as unknown;
    return Array.isArray(data) ? (data as ChatIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function saveIndex(index: ChatIndexEntry[]): void {
  try {
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
  } catch {
    /* best effort */
  }
}

/** Insert or update a chat in the index, keeping it newest-first. */
function upsertIndex(entry: ChatIndexEntry): void {
  let index = loadIndex();
  index = index.filter((e) => e.id !== entry.id);
  index.unshift(entry);
  saveIndex(index.slice(0, 500)); // cap at 500 entries
}

function removeFromIndex(chatId: string): void {
  saveIndex(loadIndex().filter((e) => e.id !== chatId));
}

/* ── Chat file CRUD ───────────────────────────────────────────────────────── */

function writeChat(chat: ChatRecord): void {
  try {
    fs.writeFileSync(chatPath(chat.id), JSON.stringify(chat, null, 2), "utf-8");
  } catch {
    /* best effort */
  }
}

/** Create a new empty chat and persist it. */
export function createChat(title = "", model = "", mode = "chat"): ChatRecord {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const chatId = `chat_${ts}_${rand(6)}`;
  const now = nowIso();

  const chat: ChatRecord = {
    id: chatId,
    title: title || "New conversation",
    model,
    created: now,
    updated: now,
    mode,
    messages: [],
    pinned: false,
  };

  writeChat(chat);
  upsertIndex({
    id: chatId,
    title: chat.title,
    model,
    created: now,
    updated: now,
    mode,
    msg_count: 0,
    pinned: false,
  });
  return chat;
}

/** Load a chat by id. Returns null if not found. */
export function loadChat(chatId: string): ChatRecord | null {
  try {
    return JSON.parse(fs.readFileSync(chatPath(chatId), "utf-8")) as ChatRecord;
  } catch {
    return null;
  }
}

/** Write the full chat to disk and update the index. */
export function saveChat(chat: ChatRecord): void {
  chat.updated = nowIso();
  writeChat(chat);
  upsertIndex({
    id: chat.id,
    title: String(chat.title ?? ""),
    model: String(chat.model ?? ""),
    created: String(chat.created ?? ""),
    updated: chat.updated,
    mode: String(chat.mode ?? "chat"),
    msg_count: (chat.messages ?? []).length,
    pinned: Boolean(chat.pinned),
  });
}

/**
 * Append one message to an existing chat and save.
 * Returns the updated chat, or null if not found.
 */
export function appendMessage(
  chatId: string,
  role: string,
  content: string,
  toolCalls?: unknown[],
  steps = 0,
  model = "",
): ChatRecord | null {
  const chat = loadChat(chatId);
  if (chat === null) return null;

  const msg: ChatMessageRecord = { role, content, ts: nowIso() };
  if (toolCalls && toolCalls.length > 0) msg.tool_calls = toolCalls;
  if (steps) msg.steps = steps;
  if (model && !chat.model) chat.model = model;

  chat.messages.push(msg);

  // Auto-title from the first user message.
  if (role === "user" && (!chat.title || chat.title === "New conversation")) {
    chat.title = content.slice(0, 72).replace(/\s+$/, "") + (content.length > 72 ? "\u2026" : "");
  }

  saveChat(chat);
  return chat;
}

/** Delete the chat file and remove it from the index. */
export function deleteChat(chatId: string): boolean {
  try {
    const p = chatPath(chatId);
    if (fs.existsSync(p)) fs.rmSync(p);
    removeFromIndex(chatId);
    return true;
  } catch {
    return false;
  }
}

export function renameChat(chatId: string, newTitle: string): boolean {
  const chat = loadChat(chatId);
  if (chat === null) return false;
  chat.title = newTitle.slice(0, 120);
  saveChat(chat);
  return true;
}

export function pinChat(chatId: string, pinned = true): boolean {
  const chat = loadChat(chatId);
  if (chat === null) return false;
  chat.pinned = pinned;
  saveChat(chat);
  return true;
}

/** Delete every chat file. Returns the count deleted. */
export function clearAllChats(): number {
  let count = 0;
  try {
    for (const fname of fs.readdirSync(CHATS_DIR)) {
      if (fname.endsWith(".json") && fname !== "index.json") {
        try {
          fs.rmSync(path.join(CHATS_DIR, fname));
          count += 1;
        } catch {
          /* ignore */
        }
      }
    }
    saveIndex([]);
  } catch {
    /* ignore */
  }
  return count;
}

/** Return index entries, newest first with pinned chats first. */
export function listChats(limit = 100, offset = 0): ChatIndexEntry[] {
  const index = loadIndex();
  const pinned = index.filter((e) => e.pinned);
  const unpinned = index.filter((e) => !e.pinned);
  return [...pinned, ...unpinned].slice(offset, offset + limit);
}

/**
 * Simple full-text search across chat titles and message content.
 * Searches index titles first (fast), then scans files for the query in messages.
 */
export function searchChats(query: string, limit = 20): ChatIndexEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return listChats(limit);

  const results: ChatIndexEntry[] = [];
  const index = loadIndex();

  for (const entry of index) {
    if (String(entry.title ?? "").toLowerCase().includes(q)) {
      results.push({ ...entry, _match: "title" });
    }
  }

  // Scan message content for the top 50 chats if title matches are insufficient.
  if (results.length < limit) {
    let scanned = 0;
    for (const entry of index) {
      if (scanned >= 50) break;
      if (results.some((r) => r.id === entry.id)) {
        scanned += 1;
        continue;
      }
      const chat = loadChat(entry.id);
      if (chat) {
        for (const msg of chat.messages ?? []) {
          if (String(msg.content ?? "").toLowerCase().includes(q)) {
            results.push({ ...entry, _match: "content" });
            break;
          }
        }
      }
      scanned += 1;
    }
  }

  return results.slice(0, limit);
}

/** Export a chat as a Markdown string. */
export function exportChatMarkdown(chatId: string): string {
  const chat = loadChat(chatId);
  if (!chat) return "";

  const lines: string[] = [
    `# ${chat.title ?? "Chat Export"}\n`,
    `**Model:** ${chat.model || "\u2014"}  \n`,
    `**Date:** ${chat.created || "\u2014"}  \n`,
    `**Mode:** ${chat.mode ?? "chat"}  \n\n`,
    "---\n\n",
  ];

  for (const msg of chat.messages ?? []) {
    const role = msg.role ?? "";
    const content = msg.content ?? "";
    const ts = msg.ts ?? "";
    if (role === "user") {
      lines.push(`### You  \n*${ts}*\n\n${content}\n\n---\n\n`);
    } else if (role === "assistant") {
      const tc = msg.tool_calls ?? [];
      const steps = msg.steps ?? 0;
      let header = "### axoniz";
      if (steps) header += `  *(agent \u00b7 ${steps} steps \u00b7 ${tc.length} tool calls)*`;
      lines.push(`${header}  \n*${ts}*\n\n${content}\n\n---\n\n`);
    }
  }

  return lines.join("");
}

/* ── Background auto-save writer ──────────────────────────────────────────── */

/**
 * Non-blocking background writer.
 * Batches rapid consecutive saves and flushes at most every 0.5 s, giving the
 * feel of instant saving without blocking the main loop.
 */
export class AsyncChatWriter {
  private pending = new Map<string, ChatRecord>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  queue(chat: ChatRecord): void {
    if (this.stopped) return;
    this.pending.set(chat.id, chat);
    if (this.timer === null) {
      // Debounce: coalesce bursts, but never wait longer than 500 ms.
      this.timer = setTimeout(() => this.flush(), 500);
      this.timer.unref?.();
    }
  }

  /** Flush every queued chat immediately. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = [...this.pending.values()];
    this.pending.clear();
    for (const chat of batch) {
      try {
        saveChat(chat);
      } catch {
        /* best effort */
      }
    }
  }

  stop(): void {
    this.flush();
    this.stopped = true;
  }
}

/* Module-level singleton writer */
const writer = new AsyncChatWriter();

/** Queue a chat for async background save. Use this from the server. */
export function queueSave(chat: ChatRecord): void {
  writer.queue(chat);
}

export function flushChatWrites(): void {
  writer.flush();
}
