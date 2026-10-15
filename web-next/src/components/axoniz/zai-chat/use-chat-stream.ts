"use client";
/**
 * useChatStream — hook for SSE streaming chat against /api/axoniz/chat.
 *
 * Now backed by JSONL storage at ~/.axoniz/db/chats/<id>.jsonl:
 *   - Each token is saved to disk in real-time via POST /api/axoniz/chats/[id]/events
 *   - When the user navigates away and comes back, messages reload from the JSONL file
 *   - The fetch continues in the background even after component unmount
 *   - No lost state — the chat survives navigation
 *
 * Returns: { messages, isStreaming, send, stop, regenerate, clear, setMessages }
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  pending?: boolean;
  error?: boolean;
}

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

export function useChatStream(chatId: string | null): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const chatIdRef = useRef<string | null>(null);

  const {
    activeProvider,
    activeModel,
    providers,
    llamacpp,
    setDataSource,
  } = useAxonizStore();

  // Load messages from JSONL file when chatId changes.
  // This is the fix for "chat clears on navigation" — the messages
  // reload from disk, not from React state (which was lost on unmount).
  useEffect(() => {
    chatIdRef.current = chatId;
    if (!chatId) {
      setMessages([]);
      return;
    }
    // Fetch the JSONL events and reconstruct messages.
    fetch(`/api/axoniz/chats/${chatId}/events`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data || !data.messages) {
          setMessages([]);
          return;
        }
        // Reconstruct messages from JSONL events.
        const msgs: ChatMessage[] = data.messages.map((m: { id: string; role: string; content: string; timestamp: number; error?: boolean }) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          timestamp: m.timestamp,
          error: m.error,
        }));
        setMessages(msgs);
        // If the last event was a token (no done/error after it),
        // the stream was interrupted — mark as still streaming.
        // (For now, just set streaming=false — the user can resend.)
      })
      .catch(() => setMessages([]));
  }, [chatId]);

  /** Save a single event to the JSONL file (fire-and-forget). */
  const saveEvent = useCallback((event: {
    type: string;
    role?: string;
    content: string;
    ts: number;
  }) => {
    const cid = chatIdRef.current;
    if (!cid) return;
    // Fire-and-forget — don't block the UI thread.
    fetch(`/api/axoniz/chats/${cid}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,  // survives page unload
    }).catch(() => { /* offline — ignore */ });
  }, []);

  const send = useCallback(
    (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };
      const assistantId = uid();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // Save the user message to JSONL immediately.
      saveEvent({ type: "message", role: "user", content: content.trim(), ts: Date.now() });

      const provider = providers[activeProvider];
      const history = [...messages, userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const ac = new AbortController();
      abortRef.current = ac;

      (async () => {
        try {
          const res = await fetch("/api/axoniz/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: content,
              history: history.slice(-20),
              provider: activeProvider,
              baseUrl: activeProvider === "llamacpp" ? llamacpp.baseUrl || provider.baseUrl : provider.baseUrl,
              apiKey: provider.apiKey,
              model: activeModel || provider.model || undefined,
            }),
            signal: ac.signal,
          });

          const source = res.headers.get("x-axoniz-source");
          if (source === "live") setDataSource("live");
          else if (source === "mock") setDataSource("mock");

          if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let acc = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              const dataLine = lines.find((l) => l.startsWith("data:"));
              if (!dataLine) continue;
              const payloadStr = dataLine.slice(5).trim();
              if (!payloadStr || payloadStr === "[DONE]") continue;
              try {
                const ev = JSON.parse(payloadStr);
                if (ev.type === "token" && typeof ev.value === "string") {
                  acc += ev.value;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: acc, pending: false } : m
                    )
                  );
                  // Save each token to JSONL (fire-and-forget).
                  saveEvent({ type: "token", content: ev.value, ts: Date.now() });
                } else if (ev.type === "thinking" && typeof ev.value === "string") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: acc || `⏳ ${ev.value}`, pending: true }
                        : m
                    )
                  );
                } else if (ev.type === "done") {
                  // Don't overwrite an error message that was set by an
                  // earlier 'error' event.
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            pending: false,
                            content: m.error
                              ? m.content
                              : (acc || ev.summary || "(empty)"),
                          }
                        : m
                    )
                  );
                  // Save the final message to JSONL.
                  if (!messages.find(m => m.id === assistantId)?.error) {
                    saveEvent({ type: "done", content: acc, ts: Date.now() });
                  }
                } else if (ev.type === "error") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, pending: false, error: true, content: `⚠ ${ev.error || "Unknown error"}` }
                        : m
                    )
                  );
                  // Save the error to JSONL.
                  saveEvent({ type: "error", content: `⚠ ${ev.error || "Unknown error"}`, ts: Date.now() });
                }
              } catch {
                /* skip malformed */
              }
            }
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)),
          );
        } catch (err) {
          const e = err as Error;
          if (e.name === "AbortError") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, pending: false, content: m.content || "(stopped)" }
                  : m
              )
            );
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, pending: false, error: true, content: `⚠ ${e.message}` }
                  : m
              )
            );
          }
          // Save the error/stop to JSONL.
          saveEvent({ type: "error", content: e.name === "AbortError" ? "(stopped)" : `⚠ ${e.message}`, ts: Date.now() });
        } finally {
          setIsStreaming(false);
          abortRef.current = null;
        }
      })();
    },
    [isStreaming, messages, activeProvider, activeModel, providers, llamacpp, setDataSource, saveEvent]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    setMessages((prev) => {
      const lastUser = [...prev].reverse().find((m) => m.role === "user");
      if (lastUser) {
        const filtered = prev.slice(0, prev.lastIndexOf(lastUser));
        setMessages(filtered);
        setTimeout(() => send(lastUser.content), 0);
      }
      return prev;
    });
  }, [send]);

  const clear = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isStreaming,
    send,
    stop,
    regenerate,
    clear,
    setMessages,
  };
}
