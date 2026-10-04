"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Loader2, Wrench, CheckCircle2, AlertTriangle, RotateCcw, ChevronDown, User, Server } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { axonizClient, parseSseFrame } from "@/lib/axoniz/client";
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolCall[];
  streaming?: boolean;
  ts: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}
interface ToolCall {
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
  success?: boolean;
}

const INITIAL: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "AXONIZ online. Pick a model in the top bar, then ask me anything — code review, refactoring, debugging, architecture.",
    ts: 0,
  },
];

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { activeProvider, providers, llamacpp, activeModel, openModelPicker } = useAxonizStore();
  const cfg = providers[activeProvider];
  const meta = PROVIDER_CATALOG.find((p) => p.id === activeProvider)!;
  const providerReady = activeProvider === "llamacpp" || !!cfg?.baseUrl;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!providerReady) {
      toast.error("Configure a provider", { description: "Click the model badge in the top bar to pick a provider." });
      openModelPicker();
      return;
    }
    setInput("");
    setBusy(true);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      ts: Date.now() / 1000,
    };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      tools: [],
      streaming: true,
      ts: Date.now() / 1000,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await axonizClient.chatStream(
        {
          message: text,
          provider: activeProvider,
          baseUrl: activeProvider === "llamacpp" ? "http://localhost:8080" : cfg.baseUrl,
          apiKey: cfg.apiKey || undefined,
          model: activeProvider === "llamacpp" ? llamacpp.modelPath.split("/").pop() : cfg.model,
          history: messages.filter((m) => m.id !== "welcome").slice(-6).map((m) => ({ role: m.role, content: m.content })),
        },
        controller.signal,
      );
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let tokenCount = 0;

      const finalize = () => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            // Estimate tokens and cost (rough: 4 chars ≈ 1 token)
            const tokensOut = Math.max(tokenCount, Math.ceil(m.content.length / 4));
            const tokensIn = Math.ceil((text.length + (m.content.length - tokenCount * 4)) / 4);
            const costUsd = (tokensIn * meta.pricePerMTokIn + tokensOut * meta.pricePerMTokOut) / 1_000_000;
            return {
              ...m,
              streaming: false,
              tokensIn,
              tokensOut,
              costUsd: meta.pricePerMTokIn === 0 && meta.pricePerMTokOut === 0 ? undefined : costUsd,
            };
          }),
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const f of frames) {
          const parsed = parseSseFrame(f);
          if (!parsed) continue;
          let ev: AxonizSseEvent;
          try { ev = { type: parsed.event, ...JSON.parse(parsed.data), ts: Date.now() / 1000 }; }
          catch { continue; }
          if (ev.type === "token") tokenCount += 1;
          applyEvent(assistantId, ev);
        }
      }
      finalize();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(err instanceof Error ? err.message : "Chat failed");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, content: m.content + (m.content ? "\n\n" : "") + `⚠️ ${err instanceof Error ? err.message : "Stream failed"}\n\nOpen Settings → Providers to configure ${meta.name}.` }
              : m,
          ),
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function applyEvent(assistantId: string, ev: AxonizSseEvent) {
    startTransition(() => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          switch (ev.type) {
            case "token": return { ...m, content: m.content + (ev.value ?? "") };
            case "thought": return { ...m, content: m.content + `> ${ev.value}\n\n` };
            case "tool_call":
              return { ...m, tools: [...(m.tools ?? []), { tool: (ev as { tool?: string }).tool ?? "tool", args: (ev as { args?: Record<string, unknown> }).args }] };
            case "tool_result":
              return { ...m, tools: (m.tools ?? []).map((t, i, arr) => i === arr.length - 1 && !t.result ? { ...t, result: (ev as { result?: string }).result, success: (ev as { success?: boolean }).success } : t) };
            case "done":
              return { ...m, streaming: false, content: m.content + (m.content.endsWith("\n") ? "" : "\n\n") + `---\n${(ev as { summary?: string }).summary ?? "Complete."}` };
            case "error":
              return { ...m, content: m.content + `\n\n⚠️ ${(ev as { error?: string }).error ?? "error"}` };
            default: return m;
          }
        }),
      );
    });
  }

  function abort() {
    abortRef.current?.abort();
    setBusy(false);
  }

  function clearChat() {
    setMessages(INITIAL);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 h-10 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-[13px] font-medium">Chat</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground gap-1.5">
            <Server className="w-2.5 h-2.5" />
            {meta.name}
            {cfg?.baseUrl ? ` · ${truncate(cfg.baseUrl, 26)}` : ""}
          </Badge>
          <Button variant="ghost" size="sm" onClick={clearChat} className="h-6 text-[10px] text-muted-foreground hover:text-foreground">Clear</Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m) => <MessageRow key={m.id} m={m} />)}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="relative rounded-md border border-border bg-input focus-within:border-foreground/30 transition-colors">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={providerReady ? "Ask anything — Shift+Enter for newline, ⌘↵ to send" : "Configure a provider in the top bar to start chatting…"}
            className="min-h-[56px] max-h-[180px] resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 pt-2.5 pb-10 text-sm placeholder:text-muted-foreground/50"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
            disabled={busy}
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
              <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">⌘↵</kbd>
              send
              <span className="text-muted-foreground/40">·</span>
              <span className="font-mono uppercase">{meta.name}</span>
              {activeModel && <span className="font-mono text-muted-foreground/80 truncate max-w-[200px]">{activeModel}</span>}
            </div>
            <div className="flex items-center gap-2">
              {busy && (
                <Button size="sm" variant="ghost" onClick={abort} className="h-7 text-[11px] text-muted-foreground hover:text-destructive gap-1.5">
                  <RotateCcw className="w-3 h-3" />Abort
                </Button>
              )}
              <Button size="sm" onClick={send} disabled={busy || !input.trim()} className="h-7 text-[11px] gap-1.5">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {busy ? "Working" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ m }: { m: ChatMessage }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-md border border-border bg-secondary flex items-center justify-center mt-0.5">
          <span className="text-[10px] font-mono font-semibold text-foreground/80">AX</span>
        </div>
      )}
      <div className={`max-w-[min(720px,85%)] flex flex-col gap-1.5`}>
        {!isUser && (
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
            <span className="text-foreground/80 font-medium">AXONIZ</span>
            {m.streaming && (
              <Badge variant="outline" className="h-4 px-1 border-foreground/20 bg-foreground/5 text-foreground text-[9px] uppercase gap-1">
                <span className="w-1 h-1 rounded-full bg-foreground animate-blink" />streaming
              </Badge>
            )}
            {!m.streaming && m.tokensOut && (
              <span className="font-mono text-[10px] text-muted-foreground/60">
                {m.tokensOut} tok
                {m.costUsd !== undefined && m.costUsd > 0 && ` · $${m.costUsd.toFixed(5)}`}
              </span>
            )}
          </div>
        )}
        {isUser && (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-0.5">
            <User className="w-3 h-3" />you
          </div>
        )}
        <div className={`rounded-md px-3.5 py-2.5 ${isUser ? "bg-foreground/5 border border-foreground/15" : "surface"}`}>
          {m.content || (m.streaming ? "…" : "")}
          {m.content && (
            <div className="prose prose-invert max-w-none prose-sm prose-p:my-1.5 prose-p:leading-relaxed prose-headings:my-2 prose-code:text-foreground/90 prose-code:bg-secondary prose-code:before:content-none prose-code:after:content-none prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-1.5 prose-strong:text-foreground prose-blockquote:border-l-foreground/40 prose-blockquote:text-muted-foreground">
              <ReactMarkdown
                components={{
                  code({ inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className ?? "");
                    if (!inline && match) {
                      return (
                        <SyntaxHighlighter
                          language={match[1]}
                          style={oneDark}
                          customStyle={{ background: "transparent", padding: "0.75rem", borderRadius: "0.375rem", fontSize: "11.5px", margin: 0, border: "1px solid var(--border)" }}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      );
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {m.tools && m.tools.length > 0 && (
          <div className="w-full space-y-1">
            {m.tools.map((t, i) => <ToolCallCard key={i} tool={t} />)}
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-md border border-border bg-secondary flex items-center justify-center mt-0.5">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-border bg-sidebar overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-secondary/60 transition-colors">
        {tool.result ? (tool.success ? <CheckCircle2 className="w-3 h-3 text-accent shrink-0" /> : <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />) : <Wrench className="w-3 h-3 text-foreground shrink-0" />}
        <span className="font-mono text-[11px] text-foreground/90">{tool.tool}</span>
        <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-border">
          <div className="p-2.5 space-y-2 text-xs">
            {tool.args && (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Args</div>
                <pre className="font-mono text-[11px] text-foreground/80 bg-background/60 rounded p-2 overflow-x-auto">{JSON.stringify(tool.args, null, 2)}</pre>
              </div>
            )}
            {tool.result && (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Result</div>
                <pre className="font-mono text-[11px] text-foreground/80 bg-background/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">{tool.result}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.replace(/^https?:\/\//, "").length > n ? s.replace(/^https?:\/\//, "").slice(0, n - 1) + "…" : s.replace(/^https?:\/\//, "");
}
