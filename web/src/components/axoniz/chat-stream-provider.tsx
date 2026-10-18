"use client";

/**
 * ChatStreamProvider — singleton owner of all per-execution EventSource
 * connections for active chats.
 *
 * Previously, the EventSource for a chat's execution was created inside
 * the useChatStream hook (per-component). When the user navigated away
 * from /chat/s/<id>, the hook unmounted → EventSource closed → live
 * tokens stopped arriving even though the backend kept generating them
 * (durable execution persisted in SQLite).
 *
 * This provider fixes that by lifting the EventSource to the layout
 * level. It watches `executionIdByChatId` in the store; whenever a new
 * executionId appears, it opens an EventSource and pushes events into
 * `messagesByChatId[chatId]`. The connection persists across all
 * navigation because the provider is mounted in the (auth) layout —
 * only the chat page view changes, not the streaming infrastructure.
 *
 * Renders null. Mounted once in the auth layout.
 */
import { useEffect, useRef } from "react";
import { useAxonizStore, type ChatMessageStore } from "@/stores/axoniz-store";
import { authedUrl, authedFetch } from "@/lib/axoniz/client";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function ChatStreamProvider() {
  const executionIdByChatId = useAxonizStore((s) => s.executionIdByChatId);
  // Refs persist across renders; we use them to track which EventSources
  // are currently open so we can open/close as the store changes.
  const connectionsRef = useRef<Map<string, { chatId: string; execId: string; es: EventSource }>>(new Map());

  useEffect(() => {
    const current = connectionsRef.current;
    const desiredExecIds = new Set(Object.entries(executionIdByChatId).map(([chatId, execId]) => `${chatId}::${execId}`));

    // Close connections that are no longer desired (or whose execId changed).
    for (const [key, conn] of current.entries()) {
      const desiredKey = `${conn.chatId}::${conn.execId}`;
      if (!desiredExecIds.has(desiredKey)) {
        try { conn.es.close(); } catch { /* ignore */ }
        current.delete(key);
      }
    }

    // Open new connections for any (chatId, execId) we don't yet have.
    for (const [chatId, execId] of Object.entries(executionIdByChatId)) {
      const key = `${chatId}::${execId}`;
      if (current.has(key)) continue;

      try {
        const es = new EventSource(authedUrl(`/api/axoniz/executions/${execId}/stream?since=0`));
        current.set(key, { chatId, execId, es });
        attachHandlers(es, chatId, execId);
      } catch {
        /* EventSource construction failed — skip, will retry on next store change */
      }
    }

    return () => {
      /* Don't close on unmount effect cleanup — we want the connections
         to persist across renders. The store change effect will close
         them when executionIdByChatId changes. */
    };
  }, [executionIdByChatId]);

  // On hard unmount of the layout itself (rare — only on full page nav
  // away from the dashboard), close all connections.
  useEffect(() => {
    return () => {
      for (const conn of connectionsRef.current.values()) {
        try { conn.es.close(); } catch { /* ignore */ }
      }
      connectionsRef.current.clear();
    };
  }, []);

  return null;
}

/** Attach all the SSE event handlers — token, thinking, status, etc.
 *  Each handler updates the store's messagesByChatId[chatId]. */
function attachHandlers(es: EventSource, chatId: string, execId: string) {
  const store = useAxonizStore.getState();

  es.addEventListener("token", (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      if (!data.value) return;
      const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && last.pending) {
        // Append to existing pending assistant message.
        // DO NOT set pending: false here — that was the bug that caused
        // each token to become a separate message bubble. The message
        // stays pending until the stream completes (done/error events).
        useAxonizStore.getState().updateMessageIn(chatId, last.id, {
          content: last.content + data.value,
        });
      } else {
        // Create a new assistant message — keep it pending so
        // subsequent tokens append to THIS message, not new bubbles.
        const newMsg: ChatMessageStore = {
          id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          content: data.value,
          timestamp: Date.now(),
          pending: true,
        };
        useAxonizStore.getState().appendMessageTo(chatId, newMsg);
      }
      // Persist the assistant token to JSONL so a full page reload
      // still shows the in-flight response. Fire-and-forget.
      void authedFetch(`/api/axoniz/chats/${chatId}/events`, {
        method: "POST",
        body: JSON.stringify({ type: "token", role: "assistant", content: data.value, ts: Date.now() }),
        keepalive: true,
      }).catch(() => { /* offline */ });
    } catch { /* ignore */ }
  });

  es.addEventListener("thinking", (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && (last.pending || !last.content)) {
        useAxonizStore.getState().updateMessageIn(chatId, last.id, {
          content: `⏳ ${data.value}`,
          pending: true,
        });
      }
    } catch { /* ignore */ }
  });

  es.addEventListener("state_change", (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      if (data.state === "running") {
        useAxonizStore.getState().setStreamingChatId(chatId);
      }
      if (["completed", "failed", "cancelled"].includes(data.state)) {
        useAxonizStore.getState().setStreamingChatId(null);
        useAxonizStore.getState().clearExecutionFor(chatId);
        // Mark any pending assistant message as no longer pending.
        const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
        for (const m of msgs) {
          if (m.pending) {
            useAxonizStore.getState().updateMessageIn(chatId, m.id, { pending: false });
          }
        }
        try { es.close(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  });

  es.addEventListener("status", (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      if (data.state === "completed" || data.state === "failed" || data.state === "cancelled") {
        useAxonizStore.getState().setStreamingChatId(null);
        useAxonizStore.getState().clearExecutionFor(chatId);
        if (data.output) {
          const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant" && last.pending) {
            useAxonizStore.getState().updateMessageIn(chatId, last.id, {
              content: data.output,
              pending: false,
            });
          }
        }
        try { es.close(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  });

  es.addEventListener("error", (e: MessageEvent) => {
    try {
      const data = e.data ? JSON.parse(e.data) : null;
      const errorText = data?.error || "Unknown error";
      const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
      const last = msgs[msgs.length - 1];
      const errMsg: ChatMessageStore = {
        id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: `⚠ ${errorText}`,
        timestamp: Date.now(),
        error: true,
      };
      if (last && last.role === "assistant" && last.pending) {
        useAxonizStore.getState().updateMessageIn(chatId, last.id, {
          content: `⚠ ${errorText}`,
          pending: false,
          error: true,
        });
      } else {
        useAxonizStore.getState().appendMessageTo(chatId, errMsg);
      }
      useAxonizStore.getState().setStreamingChatId(null);
      useAxonizStore.getState().clearExecutionFor(chatId);
    } catch { /* ignore */ }
  });

  es.addEventListener("done", (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      useAxonizStore.getState().setStreamingChatId(null);
      useAxonizStore.getState().clearExecutionFor(chatId);
      if (data.state === "completed") {
        const msgs = useAxonizStore.getState().messagesByChatId[chatId] ?? [];
        for (const m of msgs) {
          if (m.pending) {
            useAxonizStore.getState().updateMessageIn(chatId, m.id, { pending: false });
          }
        }
      }
    } catch { /* ignore */ }
    try { es.close(); } catch { /* ignore */ }
  });

  // Suppress console noise from EventSource native reconnect failures.
  es.onerror = () => { /* EventSource auto-reconnects */ };
}
