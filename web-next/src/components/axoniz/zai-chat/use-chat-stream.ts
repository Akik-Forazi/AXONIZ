"use client";
/**
 * useChatStream — hook for SSE streaming chat against /api/axoniz/chat.
 *
 * Returns: { messages, isStreaming, send, stop, regenerate, clear }
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

export function useChatStream(initialMessages: ChatMessage[] = []): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const {
    activeProvider,
    activeModel,
    providers,
    llamacpp,
    setDataSource,
  } = useAxonizStore();

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
              // Cap history to last 20 messages — local models on CPU take
              // 5-30s+ processing a 5K-token prompt before the first token.
              // Sending the entire 50-message chat history turns every
              // request into a minute-long TTFT.
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
                } else if (ev.type === "thinking" && typeof ev.value === "string") {
                  // Heartbeat — show the model is still working. Don't
                  // pollute the message content; replace the pending
                  // placeholder text so the user sees live status.
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: acc || `⏳ ${ev.value}`, pending: true }
                        : m
                    )
                  );
                } else if (ev.type === "thought" && typeof ev.value === "string") {
                  acc += `_${ev.value}_\n\n`;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: acc, pending: false } : m
                    )
                  );
                } else if (ev.type === "done") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, pending: false, content: acc || ev.summary || "(empty)" }
                        : m
                    )
                  );
                } else if (ev.type === "error") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, pending: false, error: true, content: `⚠ ${ev.error || "Unknown error"}` }
                        : m
                    )
                  );
                }
              } catch {
                /* skip malformed */
              }
            }
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m))
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
        } finally {
          setIsStreaming(false);
          abortRef.current = null;
        }
      })();
    },
    [isStreaming, messages, activeProvider, activeModel, providers, llamacpp, setDataSource]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    if (isStreaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = messages.findIndex((m) => m.id === lastUser.id);
    const trimmed = messages.slice(0, idx + 1);
    setMessages(trimmed);
    setTimeout(() => send(lastUser.content), 0);
  }, [isStreaming, messages, send]);

  const clear = useCallback(() => {
    if (isStreaming) stop();
    setMessages([]);
  }, [isStreaming, stop]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { messages, isStreaming, send, stop, regenerate, clear, setMessages };
}
