"use client";
/**
 * useChatStream — durable chat hook backed by the execution system.
 *
 * Architecture:
 *   send(content)
 *     → POST /api/axoniz/chat { message, session_id, mode }
 *     → Returns { execution_id }
 *     → Connect EventSource to /api/axoniz/executions/[id]/stream?since=0
 *
 *   On events:
 *     token → append to messages
 *     thinking → show status indicator
 *     state_change → update isStreaming
 *     done → mark complete
 *     error → show error
 *
 *   On mount (with chatId):
 *     → Load messages from JSONL via GET /api/axoniz/chats/[id]/events
 *     → Check if there's an active execution for this session
 *     → If so, reconnect to the SSE stream (no new generation)
 *     → If completed, show the persisted output
 *
 *   Browser disconnect:
 *     → Execution continues on the backend (SQLite-persisted)
 *     → On reconnect, GET /api/axoniz/executions/[id]/events?since=N
 *       returns all missed events
 *     → No duplicate generation
 *
 * Returns: { messages, isStreaming, send, stop, regenerate, clear, setMessages }
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { authedFetch, authedUrl } from "@/lib/axoniz/client";

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
  const executionIdRef = useRef<string | null>(null);
  const lastSeqRef = useRef<number>(0);
  const esRef = useRef<EventSource | null>(null);

  const {
    activeProvider,
    activeModel,
    providers,
    llamacpp,
    setDataSource,
    username,
  } = useAxonizStore();

  // Load messages from JSONL when chatId changes.
  // Also check if there's an active execution to reconnect to.
  useEffect(() => {
    chatIdRef.current = chatId;
    if (!chatId) {
      setMessages([]);
      return;
    }
    // Load persisted messages from JSONL.
    authedFetch(`/api/axoniz/chats/${chatId}/events`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.messages) { setMessages([]); return; }
        const msgs: ChatMessage[] = data.messages.map((m: { id: string; role: string; content: string; timestamp: number; error?: boolean }) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          timestamp: m.timestamp,
          error: m.error,
        }));
        setMessages(msgs);
        // Check if the last message is still pending (assistant streaming was interrupted)
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.pending) {
          // The generation was interrupted — show it as an error/stopped
          setMessages(prev => prev.map(m =>
            m.id === lastMsg.id ? { ...m, pending: false, content: m.content || "(interrupted)" } : m
          ));
        }
      })
      .catch(() => setMessages([]));
  }, [chatId]);

  /** Connect to the execution's SSE stream. */
  const connectStream = useCallback((executionId: string, sinceSeq: number) => {
    // Close any existing connection.
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    executionIdRef.current = executionId;
    lastSeqRef.current = sinceSeq;

    const es = new EventSource(authedUrl(`/api/axoniz/executions/${executionId}/stream?since=${sinceSeq}`));
    esRef.current = es;

    es.addEventListener("status", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state === "completed" || data.state === "failed" || data.state === "cancelled") {
          setIsStreaming(false);
          // If there's output, show it as the final assistant message
          if (data.output) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && last.pending) {
                return prev.map(m => m.id === last.id ? { ...m, content: data.output, pending: false } : m);
              }
              return prev;
            });
          }
          es.close();
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("token", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.value) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.pending) {
              // Append to existing pending assistant message
              return prev.map(m => m.id === last.id ? { ...m, content: m.content + data.value, pending: false } : m);
            }
            // Create new assistant message
            return [...prev, {
              id: `asst-${Date.now()}`,
              role: "assistant" as const,
              content: data.value,
              timestamp: Date.now(),
              pending: false,
            }];
          });
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("thinking", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && (last.pending || !last.content)) {
            return prev.map(m => m.id === last.id ? { ...m, content: `⏳ ${data.value}`, pending: true } : m);
          }
          return prev;
        });
      } catch { /* ignore */ }
    });

    es.addEventListener("state_change", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state === "running") setIsStreaming(true);
        if (["completed", "failed", "cancelled"].includes(data.state)) {
          setIsStreaming(false);
          es.close();
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const errorText = data.error || "Unknown error";
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.pending) {
            return prev.map(m => m.id === last.id ? { ...m, content: `⚠ ${errorText}`, pending: false, error: true } : m);
          }
          return [...prev, {
            id: `err-${Date.now()}`,
            role: "assistant" as const,
            content: `⚠ ${errorText}`,
            timestamp: Date.now(),
            error: true,
          }];
        });
        setIsStreaming(false);
      } catch { /* ignore */ }
    });

    es.addEventListener("done", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setIsStreaming(false);
        // If the execution has a final output, ensure it's shown
        if (data.state === "completed") {
          setMessages(prev => prev.map(m =>
            m.pending ? { ...m, pending: false } : m
          ));
        }
      } catch { /* ignore */ }
      es.close();
    });

    es.onerror = () => {
      // EventSource auto-reconnects. Don't set isStreaming=false here.
    };
  }, []);

  /** Save an event to the JSONL file (fire-and-forget). */
  const saveEvent = useCallback((event: { type: string; role?: string; content: string; ts: number }) => {
    const cid = chatIdRef.current;
    if (!cid) return;
    authedFetch(`/api/axoniz/chats/${cid}/events`, {
      method: "POST",
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => { /* offline */ });
  }, []);

  const send = useCallback((content: string) => {
    if (!content.trim() || isStreaming) return;
    const cid = chatIdRef.current;
    if (!cid) return;

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
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // Save user message to JSONL.
    saveEvent({ type: "message", role: "user", content: content.trim(), ts: Date.now() });

    // Generate idempotency key — unique per logical submission.
    // Reused for network retries of the SAME message. New key for
    // a different message or explicit regeneration.
    const idempotencyKey = `chat-${cid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Get the auth token from the store
    const authToken = useAxonizStore.getState().token;

    // Submit durable execution — the backend persists it and starts
    // generation in the background. We get an execution_id back.
    authedFetch("/api/axoniz/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        message: content,
        session_id: cid,
        mode: "chat",
        idempotency_key: idempotencyKey,
      }),
    })
      .then(r => r.json())
      .then((data: { execution_id?: string; error?: string }) => {
        if (data.error) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: `⚠ ${data.error}`, pending: false, error: true } : m
          ));
          setIsStreaming(false);
          return;
        }
        if (!data.execution_id) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: "⚠ No execution_id returned", pending: false, error: true } : m
          ));
          setIsStreaming(false);
          return;
        }
        // Connect to the execution's SSE stream — events come from
        // the durable journal, not directly from the LLM.
        connectStream(data.execution_id, 0);
      })
      .catch((err) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: `⚠ ${err.message}`, pending: false, error: true } : m
        ));
        setIsStreaming(false);
      });
  }, [isStreaming, username, connectStream, saveEvent]);

  const stop = useCallback(() => {
    const execId = executionIdRef.current;
    if (execId) {
      // Request cancellation on the backend — this targets the actual
      // execution, not just the SSE stream.
      authedFetch(`/api/axoniz/executions/${execId}/cancel`, { method: "POST" })
        .catch(() => { /* ignore */ });
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const regenerate = useCallback(() => {
    setMessages(prev => {
      const lastUser = [...prev].reverse().find(m => m.role === "user");
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
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
  }, []);

  // Cleanup on unmount — close SSE but DON'T cancel the execution.
  // The execution continues on the backend.
  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);

  return { messages, isStreaming, send, stop, regenerate, clear, setMessages };
}
