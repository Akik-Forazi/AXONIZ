/**
 * Chat storage backend — persists chats to ~/.axoniz/chats/.
 *
 * File layout:
 *   ~/.axoniz/chats/<id>.json   — one file per chat, full message history
 *   ~/.axoniz/chats/index.json  — list of chat metadata (id, title, timestamps)
 *
 * ID format: <username>_<YYYYMMDDHHmmss>_<8hexhash>
 *   Example: akik_20261014231015_a3f9b2c1
 *   URL-safe, sortable, self-describing (who + when).
 *
 * Privacy: chat content (messages) is stored locally on the user's
 * filesystem. NEVER logged to .axolog unless the user explicitly
 * emits a navigation event for /chat/s/<id>. The chat file itself
 * is readable only by the user (0600 on POSIX, default ACL on Windows).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  pending?: boolean;
  error?: boolean;
}

export interface ChatRecord {
  id: string;
  title: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  provider?: string;
  model?: string;
  messages: ChatMessage[];
}

export interface ChatMetadata {
  id: string;
  title: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  provider?: string;
  model?: string;
}

function getChatsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".axoniz", "chats");
}

function ensureChatsDir(): void {
  try {
    fs.mkdirSync(getChatsDir(), { recursive: true });
  } catch { /* ignore */ }
}

function sanitizeUsername(raw: string | undefined | null): string {
  if (!raw) return "anon";
  const cleaned = String(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "anon";
}

/** Build a URL-safe chat ID: <username>_<YYYYMMDDHHmmss>_<8hexhash> */
export function buildChatId(username: string | undefined | null): string {
  const user = sanitizeUsername(username);
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const hash = crypto.randomBytes(4).toString("hex"); // 8 chars
  return `${user}_${ts}_${hash}`;
}

function chatFilePath(id: string): string {
  return path.join(getChatsDir(), `${id}.json`);
}

function indexPath(): string {
  return path.join(getChatsDir(), "index.json");
}

/** Validate chat ID — only allow [a-zA-Z0-9._-]+ to prevent path traversal. */
export function isValidChatId(id: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(id) && !id.includes("..") && id.length < 200;
}

function readIndex(): ChatMetadata[] {
  try {
    const raw = fs.readFileSync(indexPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: ChatMetadata[]): void {
  ensureChatsDir();
  // Sort by updatedAt desc.
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  fs.writeFileSync(indexPath(), JSON.stringify(entries, null, 2), { encoding: "utf-8", mode: 0o600 });
}

function rebuildIndex(): ChatMetadata[] {
  // Scan all .json files in chats dir (except index.json) and rebuild the index.
  const dir = getChatsDir();
  const entries: ChatMetadata[] = [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "index.json");
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, f), "utf-8");
        const parsed = JSON.parse(raw) as ChatRecord;
        if (parsed && parsed.id && typeof parsed.id === "string") {
          entries.push({
            id: parsed.id,
            title: parsed.title ?? "(untitled)",
            username: parsed.username ?? "anon",
            createdAt: parsed.createdAt ?? 0,
            updatedAt: parsed.updatedAt ?? 0,
            messageCount: parsed.messages?.length ?? 0,
            provider: parsed.provider,
            model: parsed.model,
          });
        }
      } catch { /* corrupt file — skip */ }
    }
  } catch { /* dir not found */ }
  writeIndex(entries);
  return entries;
}

export function listChats(): ChatMetadata[] {
  ensureChatsDir();
  let idx = readIndex();
  // If index is empty, rebuild from disk.
  if (idx.length === 0) {
    idx = rebuildIndex();
  }
  return idx.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createChat(username: string | undefined | null): ChatRecord {
  ensureChatsDir();
  const id = buildChatId(username);
  const now = Date.now();
  const record: ChatRecord = {
    id,
    title: "New chat",
    username: sanitizeUsername(username),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  const filePath = chatFilePath(id);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), { encoding: "utf-8", mode: 0o600 });
  // Update index.
  const idx = readIndex();
  idx.push({
    id,
    title: record.title,
    username: record.username,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: 0,
  });
  writeIndex(idx);
  return record;
}

export function getChat(id: string): ChatRecord | null {
  if (!isValidChatId(id)) return null;
  const filePath = chatFilePath(id);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ChatRecord;
  } catch {
    return null;
  }
}

export function updateChat(
  id: string,
  patch: { title?: string; messages?: ChatMessage[]; provider?: string; model?: string },
): ChatRecord | null {
  if (!isValidChatId(id)) return null;
  ensureChatsDir();
  const filePath = chatFilePath(id);
  const existing = getChat(id);
  if (!existing) return null;
  const updated: ChatRecord = {
    ...existing,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.messages !== undefined ? { messages: patch.messages } : {}),
    ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
    ...(patch.model !== undefined ? { model: patch.model } : {}),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), { encoding: "utf-8", mode: 0o600 });
  // Update index entry.
  const idx = readIndex();
  const i = idx.findIndex(e => e.id === id);
  if (i >= 0) {
    idx[i] = {
      ...idx[i],
      title: updated.title,
      updatedAt: updated.updatedAt,
      messageCount: updated.messages.length,
      provider: updated.provider,
      model: updated.model,
    };
    writeIndex(idx);
  } else {
    // Not in index — rebuild.
    rebuildIndex();
  }
  return updated;
}

export function deleteChat(id: string): boolean {
  if (!isValidChatId(id)) return false;
  const filePath = chatFilePath(id);
  try {
    fs.unlinkSync(filePath);
  } catch {
    return false;
  }
  // Remove from index.
  const idx = readIndex().filter(e => e.id !== id);
  writeIndex(idx);
  return true;
}

/**
 * Auto-derive a title from the first user message (truncated to 50 chars).
 * Called after the first message is sent so chats don't all show "New chat".
 */
export function deriveTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 50 ? trimmed.slice(0, 50) + "…" : trimmed;
}
