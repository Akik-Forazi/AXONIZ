/**
 * JSONL chat store — append-only message storage at
 * ~/.fraziym/axoniz/db/chats/<id>.jsonl
 *
 * Each line is a JSON object representing one event:
 *   {"type":"message","role":"user","content":"hello","ts":1792...}
 *   {"type":"token","content":"He","ts":1792...}
 *   {"type":"token","content":"llo","ts":1792...}
 *   {"type":"done","content":"Hello, I am here.","ts":1792...}
 *   {"type":"error","content":"⚠ 401 Unauthorized","ts":1792...}
 *
 * Advantages over the old single-JSON-file approach:
 *   - Append-only: each token is saved in real-time via appendFileSync.
 *     If the browser crashes mid-generation, partial response is preserved.
 *   - Navigation-safe: when the user leaves /chat and comes back, the
 *     chat reloads from the JSONL file. No lost state.
 *   - Human-readable: `cat ~/.fraziym/axoniz/db/chats/<id>.jsonl | jq .`
 *   - No schema migrations: add new event types freely.
 *
 * The chat index (metadata) is still in SQLite/Prisma for fast lookups.
 */

import fs from "node:fs";
import path from "node:path";
import { axonizHome } from "./paths";

export interface ChatEvent {
  type: "message" | "token" | "thought" | "done" | "error" | "meta";
  role?: "user" | "assistant" | "system";
  content: string;
  ts: number;
  /** For 'meta' events: title, provider, model, kind updates. */
  meta?: Record<string, unknown>;
}

function getChatsDir(): string {
  return path.join(axonizHome(), "db", "chats");
}

function chatFilePath(id: string): string {
  return path.join(getChatsDir(), `${id}.jsonl`);
}

function ensureDir(): void {
  try { fs.mkdirSync(getChatsDir(), { recursive: true }); } catch { /* ignore */ }
}

/** Validate chat ID — only allow [a-zA-Z0-9._-]+ to prevent path traversal. */
function isValidChatId(id: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(id) && !id.includes("..") && id.length < 200;
}

/**
 * Append a single event to the chat JSONL file.
 * Called in real-time as tokens stream from the model — each token
 * is persisted immediately so navigation away + back doesn't lose state.
 */
export function appendChatEvent(id: string, event: ChatEvent): boolean {
  if (!isValidChatId(id)) return false;
  ensureDir();
  const filePath = chatFilePath(id);
  try {
    const line = JSON.stringify(event) + "\n";
    fs.appendFileSync(filePath, line, { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/** Append a batch of events at once (for initial message pair). */
export function appendChatEvents(id: string, events: ChatEvent[]): boolean {
  if (!isValidChatId(id)) return false;
  ensureDir();
  const filePath = chatFilePath(id);
  try {
    const lines = events.map(e => JSON.stringify(e)).join("\n") + "\n";
    fs.appendFileSync(filePath, lines, { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read all events from a chat JSONL file.
 * Used when the user navigates back to a chat — reconstructs the
 * full message history from the append-only log.
 */
export function readChatEvents(id: string): ChatEvent[] {
  if (!isValidChatId(id)) return [];
  const filePath = chatFilePath(id);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter(l => l.trim());
    const events: ChatEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as ChatEvent);
      } catch {
        // Skip malformed lines (e.g. partial write from a crash).
      }
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Reconstruct the message list from JSONL events.
 * Tokens are accumulated into the preceding assistant message.
 * Returns the final message list that the UI should render.
 */
export function reconstructMessages(id: string): Array<{
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  error?: boolean;
}> {
  const events = readChatEvents(id);
  const messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    error?: boolean;
  }> = [];
  let currentAssistantId: string | null = null;
  let currentAssistantContent = "";
  let currentAssistantError = false;

  function flushAssistant() {
    if (currentAssistantId !== null) {
      messages.push({
        id: currentAssistantId,
        role: "assistant",
        content: currentAssistantContent,
        timestamp: 0,
        error: currentAssistantError,
      });
      currentAssistantId = null;
      currentAssistantContent = "";
      currentAssistantError = false;
    }
  }

  for (const ev of events) {
    switch (ev.type) {
      case "message":
        flushAssistant();
        messages.push({
          id: `msg-${ev.ts}-${Math.random().toString(36).slice(2, 6)}`,
          role: ev.role ?? "user",
          content: ev.content,
          timestamp: ev.ts,
        });
        break;
      case "token":
        if (currentAssistantId === null) {
          currentAssistantId = `asst-${ev.ts}`;
        }
        currentAssistantContent += ev.content;
        break;
      case "done":
        flushAssistant();
        break;
      case "error":
        if (currentAssistantId === null) {
          currentAssistantId = `asst-${ev.ts}`;
        }
        currentAssistantContent = ev.content;
        currentAssistantError = true;
        flushAssistant();
        break;
      case "meta":
        // Meta events update chat metadata (title, provider, model, kind).
        // These are not messages — they're handled by the index.
        break;
    }
  }
  // Flush any remaining assistant message.
  flushAssistant();
  return messages;
}

/** Delete a chat JSONL file. */
export function deleteChatJsonl(id: string): boolean {
  if (!isValidChatId(id)) return false;
  try {
    fs.unlinkSync(chatFilePath(id));
    return true;
  } catch {
    return false;
  }
}

/** Get the file path (for diagnostics). */
export function getChatFilePath(id: string): string {
  return chatFilePath(id);
}
