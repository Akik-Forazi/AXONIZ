"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  ts: number;
}

const INITIAL: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "AXONIZ Agent online. Describe a goal and I'll send it to your configured model.",
    ts: 0,
  },
];

export function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { activeProvider, activeModel, providers, llamacpp } = useAxonizStore();
  const cfg = providers[activeProvider];
  const meta = PROVIDER_CATALOG.find((p) => p.id === activeProvider)!;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendGoal() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", streaming: true, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    const baseUrl = activeProvider === "llamacpp"
      ? (llamacpp.baseUrl || cfg.baseUrl || "http://localhost:8080")
      : cfg.baseUrl;

    try {
      const res = await fetch("/api/axoniz/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: "agent",
          provider: activeProvider,
          baseUrl,
          apiKey: cfg.apiKey || undefined,
          model: activeModel || cfg.model || undefined,
          history: messages
            .filter((m) => m.id !== "welcome")
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "token" && typeof ev.value === "string") {
              acc += ev.value;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: acc, streaming: false } : m)),
              );
            } else if (ev.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: acc || ev.summary || "(no response)", streaming: false }
                    : m,
                ),
              );
            } else if (ev.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `⚠ ${ev.error || "Unknown error"}`, streaming: false }
                    : m,
                ),
              );
            }
          } catch { /* skip malformed */ }
        }
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      );
    } catch (err) {
      const e = err as Error;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: e.name === "AbortError" ? "(stopped)" : `⚠ ${e.message}`, streaming: false }
            : m,
        ),
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Bot className="w-3.5 h-3.5" />Agent
        </h2>
        <Badge variant="outline" className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground gap-1.5">
          {meta.name}
        </Badge>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] ${msg.role === "user" ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary/10 border border-secondary/20"} rounded-lg px-4 py-2.5`}>
              {msg.role === "assistant" && msg.content ? (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-pre:bg-[#282c34] prose-pre:p-0 prose-code:before:hidden prose-code:after:hidden">
                  <ReactMarkdown
                    components={{
                      code({ inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || "");
                        const value = String(children).replace(/\n$/, "");
                        if (!inline && match) {
                          return (
                            <div className="my-2 rounded-lg overflow-hidden border border-border">
                              <div className="px-3 py-1.5 bg-zinc-900 text-[10px] text-muted-foreground font-mono border-b border-border">
                                {match[1]}
                              </div>
                              <SyntaxHighlighter language={match[1]} style={oneDark} customStyle={{ margin: 0, padding: "0.75rem", fontSize: "0.8rem" }}>
                                {value}
                              </SyntaxHighlighter>
                            </div>
                          );
                        }
                        return <code className={className} {...props}>{children}</code>;
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                  {msg.streaming && <span className="inline-block w-1.5 h-3 bg-foreground/60 animate-pulse ml-0.5 rounded-sm" />}
                </div>
              ) : msg.role === "assistant" ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Thinking...
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex gap-2 max-w-4xl">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendGoal();
              }
            }}
            placeholder="Describe the goal — e.g. audit src/core/auth.ts and propose a refactor"
            className="flex-1 min-h-[44px] max-h-[200px] resize-none text-sm"
            rows={2}
          />
          {busy ? (
            <Button variant="destructive" size="icon" onClick={stop} title="Stop">
              <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
          ) : (
            <Button size="icon" onClick={sendGoal} disabled={!input.trim()} title="Send">
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
