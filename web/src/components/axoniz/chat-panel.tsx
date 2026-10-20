"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAxonizWorkspaceStore, newId, type ChatMessage } from "@/stores/axoniz-workspace-store";
import { useAxonizStore } from "@/stores/axoniz-store";
import {
  streamAgent, messageHistoryForLlm, readFile, type AgentStreamRequest,
} from "@/lib/axoniz/client";
import { MessageView } from "./message";
import { cn } from "@/lib/utils";

export function ChatPanel() {
  const messages = useAxonizWorkspaceStore((s) => s.messages);
  const pushMessage = useAxonizWorkspaceStore((s) => s.pushMessage);
  const appendToMessage = useAxonizWorkspaceStore((s) => s.appendToMessage);
  const finalizeMessage = useAxonizWorkspaceStore((s) => s.finalizeMessage);
  const clearMessages = useAxonizWorkspaceStore((s) => s.clearMessages);
  const isStreaming = useAxonizWorkspaceStore((s) => s.isStreaming);
  const setStreaming = useAxonizWorkspaceStore((s) => s.setStreaming);
  const addToolCall = useAxonizWorkspaceStore((s) => s.addToolCall);
  const updateToolCall = useAxonizWorkspaceStore((s) => s.updateToolCall);
  const workspacePath = useAxonizWorkspaceStore((s) => s.workspacePath);
  const pushTerminalLine = useAxonizWorkspaceStore((s) => s.pushTerminalLine);
  const openFile = useAxonizWorkspaceStore((s) => s.openFile);

  const activeProvider = useAxonizStore((s) => s.activeProvider);
  const activeModel = useAxonizStore((s) => s.activeModel);

  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const ta = textAreaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") {
        setInput(detail);
        setTimeout(() => textAreaRef.current?.focus(), 0);
      }
    };
    window.addEventListener("axoniz:example", handler as EventListener);
    return () => window.removeEventListener("axoniz:example", handler as EventListener);
  }, []);

  const send = async () => {
    const message = input.trim();
    if (!message || isStreaming) return;
    const userMsg: ChatMessage = {
      id: newId(), role: "user", content: message,
      startedAt: Date.now(), endedAt: Date.now(),
    };
    pushMessage(userMsg);
    setInput("");
    setStreaming(true);

    const assistantId = newId();
    pushMessage({
      id: assistantId, role: "assistant", content: "",
      streaming: true, startedAt: Date.now(), toolCalls: [],
    });

    const body: AgentStreamRequest = {
      message, provider: activeProvider, model: activeModel ?? undefined,
      history: messageHistoryForLlm(messages),
      workspace: workspacePath ?? undefined, maxSteps: 8, mode: "chat",
    };

    pushTerminalLine({
      id: `cmd-${Date.now()}`, kind: "command",
      text: `> ${message.slice(0, 100)}`, ts: Date.now(),
    });

    abortRef.current = streamAgent(body, {
      onStep: (step, total) => {
        pushTerminalLine({
          id: `step-${Date.now()}-${step}`, kind: "info",
          text: `step ${step}/${total}`, ts: Date.now(),
        });
      },
      onToken: (token) => appendToMessage(assistantId, token),
      onToolCall: (tc) => {
        const id = tc.id || newId();
        addToolCall({
          id, name: tc.name, args: tc.args, status: "running",
          startedAt: Date.now(),
          path: typeof tc.args?.path === "string" ? tc.args.path : undefined,
        });
        pushTerminalLine({
          id: `tc-${id}`, kind: "command",
          text: `▸ ${tc.name} ${JSON.stringify(tc.args).slice(0, 80)}`, ts: Date.now(),
        });
        // Auto-open file in the editor when the agent reads one — gives the
        // user live visibility into what's being inspected without needing
        // a file explorer.
        if (tc.name === "read_file" && typeof tc.args?.path === "string") {
          const path = tc.args.path;
          // Don't await — fire-and-forget so the SSE stream keeps flowing.
          (async () => {
            try {
              const f = await readFile(path);
              openFile({
                path: f.path, content: f.content,
                language: f.language, readOnly: f.readOnly,
              });
            } catch {
              /* ignore — file might not exist or be binary */
            }
          })();
        }
      },
      onToolResult: (tr) => {
        const id = tr.id || newId();
        updateToolCall(id, {
          status: tr.status === "error" ? "error" : "ok",
          result: tr.result, summary: tr.summary, path: tr.path,
          endedAt: Date.now(),
        });
        pushTerminalLine({
          id: `tr-${id}`,
          kind: tr.status === "error" ? "error" : "success",
          text: `${tr.status === "error" ? "✗" : "✓"} ${tr.name} · ${tr.summary ?? ""}`.slice(0, 120),
          ts: Date.now(),
        });
      },
      onDone: (payload) => {
        finalizeMessage(assistantId, { content: payload.response });
        setStreaming(false);
        abortRef.current = null;
      },
      onError: (err) => {
        finalizeMessage(assistantId, { error: err, content: `Generation failed: ${err}` });
        setStreaming(false);
        abortRef.current = null;
        pushTerminalLine({
          id: `err-${Date.now()}`, kind: "error",
          text: `error: ${err}`.slice(0, 200), ts: Date.now(),
        });
      },
    });
  };

  const cancel = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStreaming(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? <EmptyState /> : (
          <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6 sm:space-y-7">
            {messages.map((m) => <MessageView key={m.id} message={m} />)}
            {isStreaming && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono pl-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot glow-accent" />
                <span>agent running</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-3">
        <div className="max-w-3xl mx-auto">
          <div className={cn(
            "relative rounded-2xl glass-elevated transition-all duration-300",
            isStreaming ? "opacity-60" : "hover:shadow-lg",
          )}>
            <Textarea
              ref={textAreaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isStreaming}
              placeholder={isStreaming
                ? "Agent is working… press Stop to interrupt."
                : "Ask AXONIZ to read, search, edit, or run something in this workspace…"}
              className="min-h-[56px] max-h-[240px] resize-none border-0 bg-transparent px-3 sm:px-4 py-3.5 pr-24 sm:pr-28 text-[13px] sm:text-[14px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/70"
              rows={1}
            />
            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1">
              {messages.length > 0 && !isStreaming && (
                <Button variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground press"
                  onClick={clearMessages} aria-label="Clear conversation" title="Clear conversation">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              {isStreaming ? (
                <Button size="sm" variant="destructive" onClick={cancel} className="h-8 gap-1.5 press">
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button size="sm" onClick={send} disabled={!input.trim()}
                  className="h-8 gap-1.5 press shadow-md shadow-primary/20">
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded glass-inset text-[9px]">↵</kbd>
              <span>send</span>
              <span className="text-foreground/20">·</span>
              <kbd className="px-1.5 py-0.5 rounded glass-inset text-[9px]">⇧↵</kbd>
              <span>newline</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-accent" />
              <span>{activeProvider}</span>
              <span className="text-foreground/30">·</span>
              <span className="text-foreground/80">{activeModel ?? "—"}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const examples = [
    { title: "Explore the repo", prompt: "List the files in the workspace root and tell me what this project is." },
    { title: "Find a symbol", prompt: "Where is the agent.run() method defined? Show me its signature." },
    { title: "Make a change", prompt: "Add a README.md describing the AXONIZ workspace UI." },
    { title: "Run tests", prompt: "Run the existing test suite and report pass/fail counts." },
  ];
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8 sm:py-12 lg:py-16">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-4 shadow-xl shadow-primary/30 glow-primary">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-gradient mb-2">Chat</h1>
        <p className="text-[13px] text-muted-foreground max-w-md text-balance leading-relaxed">
          Where you and AI collaborate seamlessly — ask, search, delegate to agents, get things done.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
        {examples.map((ex) => (
          <button
            key={ex.title}
            onClick={() => window.dispatchEvent(new CustomEvent("axoniz:example", { detail: ex.prompt }))}
            className="text-left p-3.5 rounded-xl glass-panel glass-hover press group"
          >
            <div className="text-[12px] font-medium mb-1 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-accent" />
              {ex.title}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono line-clamp-2">{ex.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
