"use client";

/**
 * useChatStream — chat hook backed by the global ChatStreamProvider.
 *
 * Architecture (after refactor):
 *   send(content)
 *     → POST /api/axoniz/chat { message, session_id, mode }
 *     → Returns { execution_id }
 *     → store.setExecutionFor(chatId, execId)
 *     → ChatStreamProvider (in layout) sees the new execId, opens
 *       EventSource, pushes events into store.messagesByChatId[chatId]
 *
 *   On mount (with chatId):
 *     → Load messages from JSONL → store.setMessagesFor(chatId, msgs)
 *     → (Reconnection to an in-flight execution is automatic: if the
 *        user previously sent a message and executionIdByChatId[chatId]
 *        is still set in the store, the provider is already streaming
 *        into messagesByChatId[chatId].)
 *
 *   Browser navigation:
 *     → React unmounts ChatSection, but EventSource lives in the
 *       layout-level provider → tokens keep flowing into the store
 *       → user returns to /chat/s/<id> and sees the in-progress
 *       assistant message immediately, no reload needed.
 *
 *   Hard refresh:
 *     → store is wiped, but executionIdByChatId can be re-derived by
 *       calling /api/axoniz/chats/[id]/active-execution (TODO — backend
 *       may not expose this yet). For now, JSONL persistence covers
 *       the common case: messages load from disk, user can resend.
 *
 * Returns: { messages, isStreaming, send, stop, regenerate, clear }
 */
import { useEffect, useCallback } from "react";
import { useAxonizStore, type ChatMessageStore } from "@/stores/axoniz-store";
import { authedFetch } from "@/lib/axoniz/client";

export interface ChatMessage extends ChatMessageStore {}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (content: string) => void;
  stop: () => void;
  regenerate: () => void;
  clear: () => void;
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// STABLE empty array — used as the fallback when chatId is null or when
// messagesByChatId[chatId] doesn't exist yet. Without this, the selector
// would return a NEW `[]` on every call, which Zustand sees as a state
// change (different reference) → triggers a re-render → selector runs
// again → another new `[]` → infinite loop → "Maximum update depth
// exceeded". This is a classic Zustand gotcha with selectors that return
// arrays/objects. The fix is to return the SAME reference every time
// when there's no real data.
const EMPTY_MESSAGES: ChatMessageStore[] = [];

export function useChatStream(chatId: string | null): UseChatStreamReturn {
  // Read live from the store — these update as the ChatStreamProvider
  // receives SSE events, even when this hook isn't actively mounted
  // on a chat page (e.g. user is on /system).
  const messages = useAxonizStore((s) =>
    chatId ? (s.messagesByChatId[chatId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  );
  const isStreaming = useAxonizStore((s) =>
    chatId ? s.streamingChatId === chatId : false
  );

  const setMessagesFor = useAxonizStore((s) => s.setMessagesFor);
  const appendMessageTo = useAxonizStore((s) => s.appendMessageTo);
  const updateMessageIn = useAxonizStore((s) => s.updateMessageIn);
  const clearChatMessages = useAxonizStore((s) => s.clearChatMessages);
  const setStreamingChatId = useAxonizStore((s) => s.setStreamingChatId);
  const setExecutionFor = useAxonizStore((s) => s.setExecutionFor);
  const clearExecutionFor = useAxonizStore((s) => s.clearExecutionFor);

  // Load persisted messages from JSONL when chatId changes.
  // Skips if we already have messages in the store for this chatId
  // (e.g. user navigated away and came back — store still has them).
  useEffect(() => {
    if (!chatId) return;
    const existing = useAxonizStore.getState().messagesByChatId[chatId];
    if (existing && existing.length > 0) return; // already in store
    authedFetch(`/api/axoniz/chats/${chatId}/events`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.messages) {
          setMessagesFor(chatId, []);
          return;
        }
        const msgs: ChatMessageStore[] = data.messages.map(
          (m: { id: string; role: string; content: string; timestamp: number; error?: boolean; pending?: boolean }) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            timestamp: m.timestamp,
            error: m.error,
            pending: m.pending,
          }),
        );
        // If the last assistant message is still pending, the stream
        // was interrupted — mark as stopped so the user can retry.
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant" && last.pending) {
          msgs[msgs.length - 1] = {
            ...last,
            pending: false,
            content: last.content || "(interrupted)",
          };
        }
        setMessagesFor(chatId, msgs);
      })
      .catch(() => setMessagesFor(chatId, []));
  }, [chatId, setMessagesFor]);

  /** Save an event to the JSONL file (fire-and-forget). */
  const saveEvent = useCallback(
    (event: { type: string; role?: string; content: string; ts: number }) => {
      if (!chatId) return;
      authedFetch(`/api/axoniz/chats/${chatId}/events`, {
        method: "POST",
        body: JSON.stringify(event),
        keepalive: true,
      }).catch(() => { /* offline */ });
    },
    [chatId],
  );

  const send = useCallback(
    (content: string) => {
      if (!content.trim() || !chatId) return;
      if (useAxonizStore.getState().streamingChatId === chatId) return;

      const userMsg: ChatMessageStore = {
        id: uid(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };
      const assistantId = uid();
      const assistantMsg: ChatMessageStore = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        pending: true,
      };
      appendMessageTo(chatId, userMsg);
      appendMessageTo(chatId, assistantMsg);
      setStreamingChatId(chatId);

      // Save user message to JSONL.
      saveEvent({ type: "message", role: "user", content: content.trim(), ts: Date.now() });

      const idempotencyKey = `chat-${chatId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const authToken = useAxonizStore.getState().token;

      // Submit durable execution — the backend persists it and starts
      // generation in the background. We get an execution_id back.
      authedFetch("/api/axoniz/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          message: content,
          session_id: chatId,
          mode: "chat",
          idempotency_key: idempotencyKey,
        }),
      })
        .then((r) => r.json())
        .then((data: { execution_id?: string; error?: string }) => {
          if (data.error) {
            updateMessageIn(chatId, assistantId, {
              content: `⚠ ${data.error}`,
              pending: false,
              error: true,
            });
            setStreamingChatId(null);
            return;
          }
          if (!data.execution_id) {
            updateMessageIn(chatId, assistantId, {
              content: "⚠ No execution_id returned",
              pending: false,
              error: true,
            });
            setStreamingChatId(null);
            return;
          }
          // ChatStreamProvider (in the auth layout) sees this and
          // opens an EventSource for the execution. Tokens then flow
          // into store.messagesByChatId[chatId] — even if the user
          // navigates away from /chat/s/<id>.
          setExecutionFor(chatId, data.execution_id);
        })
        .catch((err) => {
          updateMessageIn(chatId, assistantId, {
            content: `⚠ ${err.message}`,
            pending: false,
            error: true,
          });
          setStreamingChatId(null);
        });
    },
    [chatId, appendMessageTo, updateMessageIn, setStreamingChatId, setExecutionFor, saveEvent],
  );

  const stop = useCallback(() => {
    if (!chatId) return;
    const execId = useAxonizStore.getState().executionIdByChatId[chatId];
    if (execId) {
      authedFetch(`/api/axoniz/executions/${execId}/cancel`, { method: "POST" }).catch(() => { /* ignore */ });
    }
    clearExecutionFor(chatId);
    setStreamingChatId(null);
    // Mark the pending assistant message as stopped.
    const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
    for (const m of msgs) {
      if (m.pending) {
        updateMessageIn(chatId, m.id, {
          pending: false,
          content: m.content || "(stopped)",
        });
      }
    }
  }, [chatId, clearExecutionFor, setStreamingChatId, updateMessageIn]);

  const regenerate = useCallback(() => {
    if (!chatId) return;
    const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Truncate to just before the last user message, then resend.
    const idx = msgs.lastIndexOf(lastUser);
    setMessagesFor(chatId, msgs.slice(0, idx));
    setTimeout(() => send(lastUser.content), 0);
  }, [chatId, setMessagesFor, send]);

  const clear = useCallback(() => {
    if (!chatId) return;
    clearExecutionFor(chatId);
    clearChatMessages(chatId);
    setStreamingChatId(null);
  }, [chatId, clearExecutionFor, clearChatMessages, setStreamingChatId]);

  // setMessages is kept for backwards-compat (the existing ChatSection
  // uses it for some local mutations). Translates an updater into a
  // store write so the data flow stays unified.
  const setMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      if (!chatId) return;
      const prev = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
      setMessagesFor(chatId, updater(prev));
    },
    [chatId, setMessagesFor],
  );

  return { messages, isStreaming, send, stop, regenerate, clear, setMessages };
}
