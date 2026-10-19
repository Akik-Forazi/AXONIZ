"use client";

import { useEffect, useRef, useCallback } from "react";
import { Sparkles, Code, BookOpen, Lightbulb, User, Bot, Copy, Check, RefreshCw, AlertCircle, ArrowUp, Square, Brain, Globe, Mic, Paperclip, ChevronRight } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";
import { useChatStream, type ChatMessage } from "../zai-chat/use-chat-stream";
import { useConversations } from "../zai-chat/use-conversations";
import { Markdown } from "../zai-chat/markdown";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  { icon: Sparkles, title: "Brainstorm ideas", prompt: "Help me brainstorm 5 names for a developer-tool startup focused on local-first AI" },
  { icon: Code, title: "Write code", prompt: "Write a TypeScript function that debounces an async function with cancellation support" },
  { icon: BookOpen, title: "Explain a concept", prompt: "Explain how WebTransport differs from WebSockets, with concrete use cases for each" },
  { icon: Lightbulb, title: "Solve a problem", prompt: "My Next.js production build is failing with 'Module not found' — how do I debug this?" },
];

/* ─── Think-tag parser ───────────────────────────────────────────────
 * Many models (GLM, Qwen, DeepSeek) output <think>...</think> blocks
 * for reasoning. This parser splits the content into:
 *   - thinkingParts: array of reasoning snippets (hidden by default)
 *   - responseParts: the actual response (shown as the main content)
 */
function parseThinkTags(content: string): { thinking: string[]; response: string } {
  const thinking: string[] = [];
  let response = content;

  // Match <think>...</think> (including unclosed <think> at the end during streaming)
  const thinkRegex = /<think>([\s\S]*?)(<\/think>|$)/g;
  let match;
  let lastIndex = 0;
  const responseParts: string[] = [];

  while ((match = thinkRegex.exec(content)) !== null) {
    // Text before <think> tag → response
    if (match.index > lastIndex) {
      responseParts.push(content.slice(lastIndex, match.index));
    }
    // The thinking content
    thinking.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }
  // Remaining text after last </think> → response
  if (lastIndex < content.length) {
    responseParts.push(content.slice(lastIndex));
  }

  response = responseParts.join('').trim();
  return { thinking, response };
}

/* ─── Think section (collapsible reasoning) ────────────────────────── */
function ThinkSection({ parts }: { parts: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (parts.length === 0) return null;
  return (
    <div className="mb-2 border border-border/40 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary/40 smooth"
      >
        <Brain className="w-3 h-3" />
        <span>Reasoning ({parts.length} step{parts.length > 1 ? 's' : ''})</span>
        <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground/80 border-t border-border/40 space-y-2 max-h-48 overflow-y-auto">
          {parts.map((p, i) => (
            <div key={i} className="whitespace-pre-wrap font-mono leading-relaxed">{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}


export function ChatSection() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const activeId = params.id;  // ChatGPT-style: chat ID comes from the URL
  const {
    conversations, active, loading,
    newConversation, selectConversation, deleteConversation,
    renameConversation, updateMessages,
  } = useConversations();

  // When a chat is selected from the sidebar, navigate to /chat/s/<id>.
  // ChatGPT-style: the URL bar always shows the chat ID.
  const handleSelect = useCallback((id: string) => {
    selectConversation(id);
    router.push(`/chat/s/${id}`);
  }, [selectConversation, router]);

  // When "New chat" is clicked, create a new chat + navigate to it.
  const handleNew = useCallback(async () => {
    const conv = await newConversation();
    if (conv?.id) {
      router.push(`/chat/s/${conv.id}`);
    }
  }, [newConversation, router]);

  // Auto-create a new chat if we're at /chat (no ID in URL) with no chats.
  // When at /chat/s/<id>, don't auto-create — just load that chat.
  useEffect(() => {
    if (!loading && conversations.length === 0 && !activeId) {
      void handleNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, conversations.length, activeId]);

  // Pass the chatId from the URL to useChatStream so it loads/saves
  // from ~/.fraziym/axoniz/db/chats/<id>.jsonl.
  const stream = useChatStream(activeId);

  const handleSend = (content: string) => {
    if (!activeId) {
      // Fire-and-forget create + send. The setTimeout waits for the
      // next tick so newConversation's setState has applied.
      void newConversation().then(() => setTimeout(() => stream.send(content), 0));
      return;
    }
    stream.send(content);
  };

  const hasMessages = stream.messages.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stick) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [stream.messages, stick]);

  return (
    <div className="h-full flex flex-col">
      {hasMessages ? (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="w-full px-12 py-4 divide-y divide-border/40">
              {stream.messages.map((m) => (
                <div key={m.id} className={cn("flex gap-3 px-6 py-3 group", m.role === "user" && "justify-end")}>
                  {m.role === "assistant" && (
                    <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white">
                      <Bot className="size-3.5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 max-w-[calc(100%-3rem)]">
                    {m.error ? (
                      <div className="flex items-start gap-2 text-sm text-red-500">
                        <AlertCircle className="size-4 shrink-0 mt-0.5" />
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      </div>
                    ) : m.content ? (
                      <div className="text-sm">
                        {(() => {
                          const { thinking, response } = parseThinkTags(m.content);
                          return (
                            <>
                              <ThinkSection parts={thinking} />
                              {response && <Markdown content={response} />}
                            </>
                          );
                        })()}
                        {stream.isStreaming && m.pending && <span className="inline-block w-1.5 h-3.5 bg-foreground/80 ml-0.5 animate-pulse rounded-[1px]" />}
                        {!m.pending && m.content.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={m.content} />
                            <button onClick={stream.regenerate} className="size-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" title="Regenerate">
                              <RefreshCw className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex gap-1">
                          <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                          <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                          <span className="size-1.5 rounded-full bg-current animate-bounce" />
                        </span>
                        Thinking...
                      </div>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white">
                      <User className="size-3.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <ChatInput onSend={handleSend} onStop={stream.stop} isStreaming={stream.isStreaming} />
        </>
      ) : (
        <>
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
            <div className="size-16 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-violet-500/20 mb-6">A</div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1.5">How can I help you today?</h1>
            <p className="text-muted-foreground text-sm mb-8">Ask anything — your model responds in real-time</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-4xl">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button key={s.title} onClick={() => handleSend(s.prompt)} className="group flex flex-col gap-1 p-4 rounded-xl border border-border bg-card hover:bg-accent/30 hover:border-foreground/20 transition-all text-left">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground group-hover:text-foreground" />
                      <span className="text-sm font-medium">{s.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground line-clamp-2">{s.prompt}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <ChatInput onSend={handleSend} onStop={stream.stop} isStreaming={stream.isStreaming} />
        </>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="size-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" title="Copy">
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function ChatInput({ onSend, onStop, isStreaming }: { onSend: (content: string) => void; onStop: () => void; isStreaming: boolean }) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { activeProvider, providers, llamacpp, activeModel } = useAxonizStore();
  const cfg = providers[activeProvider];
  const model = activeModel || cfg.model || "";

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

  const submit = () => {
    if (!value.trim() || isStreaming) return;
    onSend(value);
    setValue("");
  };

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="w-full px-12">
        <div className={`relative rounded-2xl border border-border bg-background shadow-sm composer-flow ${value.trim() ? "has-input" : ""}`}>
          <div className="flex items-center gap-2 px-3 pt-2.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{model || "no model"}</span>
            <span className="opacity-40">·</span>
            <span>Press Enter to send, Shift+Enter for new line</span>
          </div>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Ask anything"
            rows={1}
            className="w-full resize-none bg-transparent border-0 px-3 pt-2 pb-1 text-sm focus:outline-none placeholder:text-muted-foreground/60"
            style={{ minHeight: "40px", maxHeight: "240px" }}
          />
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button type="button" className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Attach"><Paperclip className="size-4" /></button>
            <button type="button" className="flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted" title="Think"><Brain className="size-3.5" /><span className="hidden sm:inline">Think</span></button>
            <button type="button" className="flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted" title="DeepSearch"><Globe className="size-3.5" /><span className="hidden sm:inline">DeepSearch</span></button>
            <div className="ml-auto">
              {isStreaming ? (
                <button onClick={onStop} className="size-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-80" title="Stop"><Square className="size-3.5" /></button>
              ) : (
                <button onClick={submit} disabled={!value.trim()} className="size-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-80 disabled:opacity-30" title="Send"><ArrowUp className="size-4" /></button>
              )}
            </div>
          </div>
        </div>
        <div className="text-center text-[10px] text-muted-foreground/60 mt-2">AXONIZ can make mistakes. Verify important information.</div>
      </div>
    </div>
  );
}
