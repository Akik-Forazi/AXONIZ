"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, User, Brain, Wrench, FileCode, Clock, Zap, CheckCircle2, AlertCircle } from "lucide-react";
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Save queue — debounced PUT so we don't write on every streamed token.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tokensReceived, setTokensReceived] = useState(0);
  const [currentThought, setCurrentThought] = useState<string | null>(null);
  const [actionSteps, setActionSteps] = useState<Array<{ kind: string; text: string; ts: number }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const { activeProvider, activeModel, providers, llamacpp } = useAxonizStore();
  const cfg = providers[activeProvider];
  const meta = PROVIDER_CATALOG.find((p) => p.id === activeProvider)!;

  // Live timer while busy.
  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedMs(Date.now() - startTimeRef.current);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [busy]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, currentThought, actionSteps]);

  /**
   * Parse the streamed text for "thinking" markers + tool-call fences that
   * reasoning-trained models (Qwen3, DeepSeek-R1, etc.) emit. When detected,
   * split them out into the live progress panel so the user sees what the
   * model is working on instead of just watching tokens scroll by.
   */
  function parseStreamedText(text: string) {
    // Reasoning: <think>...</think> or <thought>...</thought>
    const thinkMatch = text.match(/<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/);
    if (thinkMatch) {
      setCurrentThought(thinkMatch[1].trim());
    } else {
      // No closed tag yet — maybe an open one being streamed.
      const openMatch = text.match(/<(?:think|thought)>([\s\S]*)$/);
      if (openMatch) {
        setCurrentThought(openMatch[1].trim() + "…");
      }
    }

    // Tool calls: ```tool_call ... ``` or ```bash ... ```
    const toolCallBlocks = text.match(/```(?:tool_call|bash|sh)\n([\s\S]*?)```/g);
    if (toolCallBlocks) {
      for (const block of toolCallBlocks) {
        const body = block.replace(/^```(?:tool_call|bash|sh)\n/, "").replace(/```$/, "").trim();
        if (!actionSteps.some(s => s.text === body)) {
          setActionSteps(prev => [...prev, { kind: "tool", text: body, ts: Date.now() }]);
        }
      }
    }

    // Diffs: ```diff ... ```
    const diffBlocks = text.match(/```diff\n([\s\S]*?)```/g);
    if (diffBlocks) {
      for (const block of diffBlocks) {
        const body = block.replace(/^```diff\n/, "").replace(/```$/, "").trim();
        if (!actionSteps.some(s => s.text === body)) {
          setActionSteps(prev => [...prev, { kind: "diff", text: body, ts: Date.now() }]);
        }
      }
    }
  }

  /**
   * Load the most recent agent session (if any) from the backend, or
   * create a fresh one if none exists. The agent page persists the full
   * goal-conversation history to ~/.axoniz/chats/<id>.json with
   * kind:'agent' — same store as chat, different discriminator.
   */
  async function loadOrCreateSession() {
    setSessionLoading(true);
    try {
      const r = await fetch("/api/axoniz/chats");
      const data = await r.json();
      // Pick the most recent agent session.
      const agentChat = (data.chats ?? []).find((c: { kind?: string }) => c.kind === "agent");
      if (agentChat) {
        // Load full messages.
        const full = await fetch(`/api/axoniz/chats/${agentChat.id}`);
        if (full.ok) {
          const record = await full.json();
          setSessionId(record.id);
          if (Array.isArray(record.messages) && record.messages.length > 0) {
            setMessages(record.messages);
          }
        }
      } else {
        // Create a new agent session.
        const create = await fetch("/api/axoniz/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "axoniz", kind: "agent" }),
        });
        if (create.ok) {
          const record = await create.json();
          setSessionId(record.id);
        }
      }
    } catch { /* offline — operate without backend */ }
    finally { setSessionLoading(false); }
  }

  /** Debounced save of the current messages to the backend. */
  function scheduleSave() {
    if (!sessionId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const currentMessages = messagesRef.current;
      const firstUser = currentMessages.find(m => m.role === "user");
      const title = firstUser
        ? (firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? "…" : ""))
        : "New agent goal";
      try {
        await fetch(`/api/axoniz/chats/${sessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            messages: currentMessages,
            provider: activeProvider,
            model: activeModel,
            kind: "agent",
          }),
          keepalive: true,
        });
      } catch { /* offline — drop */ }
    }, 600);
  }

  // Keep a ref to messages so the debounced save doesn't capture a stale value.
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Load the agent session on mount.
  useEffect(() => { void loadOrCreateSession(); }, []);

  async function sendGoal() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setElapsedMs(0);
    setTokensReceived(0);
    setCurrentThought(null);
    setActionSteps([]);
    startTimeRef.current = Date.now();

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", streaming: true, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    scheduleSave();

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
              setTokensReceived((n) => n + 1);
              parseStreamedText(acc);
              // Strip <think>/<thought> blocks from the displayed response —
              // they go in the "Live thoughts" panel instead.
              const display = acc
                .replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/g, "")
                .replace(/<(?:think|thought)>[\s\S]*$/g, "(thinking…)")
                .trim();
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: display, streaming: false } : m)),
              );
            } else if (ev.type === "done") {
              const finalDisplay = acc
                .replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/g, "")
                .replace(/<(?:think|thought)>[\s\S]*$/g, "")
                .trim();
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: finalDisplay || ev.summary || "(no response)", streaming: false }
                    : m,
                ),
              );
              setCurrentThought(null);
              // Final save after the stream completes.
              scheduleSave();
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
      scheduleSave();
    } catch (err) {
      const e = err as Error;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: e.name === "AbortError" ? "(stopped)" : `⚠ ${e.message}`, streaming: false }
            : m,
        ),
      );
      scheduleSave();
    } finally {
      setBusy(false);
      startTimeRef.current = null;
      setCurrentThought(null);
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
        <div className="flex items-center gap-2">
          {/* Live status panel — shows elapsed time + tokens received while busy */}
          {busy && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {(elapsedMs / 1000).toFixed(1)}s
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {tokensReceived} tok
              </span>
              {currentThought && (
                <span className="flex items-center gap-1 text-violet-500">
                  <Brain className="w-3 h-3 animate-pulse" />
                  thinking
                </span>
              )}
            </div>
          )}
          <Badge variant="outline" className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground gap-1.5">
            {meta.name}
          </Badge>
        </div>
      </div>

      {/* Live thoughts panel — shown when the model is reasoning */}
      {currentThought && (
        <div className="px-4 py-2 border-b border-violet-500/20 bg-violet-500/5">
          <div className="flex items-center gap-2 text-[11px] text-violet-400 mb-1">
            <Brain className="w-3 h-3 animate-pulse" />
            <span className="font-mono uppercase tracking-wider">Live reasoning</span>
          </div>
          <div className="text-[12px] text-foreground/70 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
            {currentThought}
          </div>
        </div>
      )}

      {/* Action steps panel — shown when the model emits tool calls or diffs */}
      {actionSteps.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-secondary/20">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
            <Wrench className="w-3 h-3" />
            <span className="font-mono uppercase tracking-wider">
              {actionSteps.length} step{actionSteps.length === 1 ? "" : "s"} proposed
            </span>
          </div>
          <div className="space-y-1.5">
            {actionSteps.map((step, i) => (
              <div key={i} className="rounded-md border border-border bg-background/60 overflow-hidden">
                <div className="px-2 py-1 border-b border-border/50 flex items-center gap-2 text-[10px]">
                  {step.kind === "diff" ? <FileCode className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                  <span className="font-mono uppercase tracking-wider text-muted-foreground">
                    {step.kind === "diff" ? "file change" : "tool call"}
                  </span>
                  <span className="font-mono text-muted-foreground/60 ml-auto">
                    +{step.text.split("\n").filter(l => l.startsWith("+")).length}/-{step.text.split("\n").filter(l => l.startsWith("-")).length}
                  </span>
                </div>
                <pre className="text-[11px] font-mono p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {step.text.slice(0, 600)}
                  {step.text.length > 600 ? "\n…" : ""}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

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
