"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Square, Loader2, Sparkles, Activity, FileCode, Clock } from "lucide-react";
import { PageHeader, GlassCard, StatusPill, EmptyState, StatTile } from "@/components/axoniz/page-primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAxonizWorkspaceStore, newId, type ToolCall } from "@/stores/axoniz-workspace-store";
import { useAxonizStore } from "@/stores/axoniz-store";
import { streamAgent, type AgentStreamRequest } from "@/lib/axoniz/client";
import { MessageView } from "@/components/axoniz/message";
import { cn } from "@/lib/utils";

/**
 * Agent page — full agentic execution.
 *
 * One-shot task input that runs the real AXONIZ agent loop (all 65 tools,
 * authority gates, trajectory recording, palace sync, axodex context,
 * swarm orchestration, etc.). The agent runs autonomously until it calls
 * `done()` or hits max_steps.
 *
 * Distinct from:
 *  - `/` (Chat) — lightweight conversational AI helper with limited tools
 *  - `/goal` (Goal mode) — autonomous goal pursuit with 6-step loop + goal ID
 */
export default function AgentPage() {
  const messages = useAxonizWorkspaceStore((s) => s.messages);
  const pushMessage = useAxonizWorkspaceStore((s) => s.pushMessage);
  const appendToMessage = useAxonizWorkspaceStore((s) => s.appendToMessage);
  const finalizeMessage = useAxonizWorkspaceStore((s) => s.finalizeMessage);
  const clearMessages = useAxonizWorkspaceStore((s) => s.clearMessages);
  const isStreaming = useAxonizWorkspaceStore((s) => s.isStreaming);
  const setStreaming = useAxonizWorkspaceStore((s) => s.setStreaming);
  const addToolCall = useAxonizWorkspaceStore((s) => s.addToolCall);
  const updateToolCall = useAxonizWorkspaceStore((s) => s.updateToolCall);
  const toolCalls = useAxonizWorkspaceStore((s) => s.toolCalls);
  const workspacePath = useAxonizWorkspaceStore((s) => s.workspacePath);

  const activeProvider = useAxonizStore((s) => s.activeProvider);
  const activeModel = useAxonizStore((s) => s.activeModel);

  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, toolCalls]);

  useEffect(() => {
    const ta = textAreaRef.current; if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  // Clear the workspace store messages on mount — they're shared with the chat
  // page (same store). Don't want chat history bleeding into agent runs.
  useEffect(() => { clearMessages(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const send = async () => {
    const message = input.trim();
    if (!message || isStreaming) return;
    pushMessage({ id: newId(), role: "user", content: message, startedAt: Date.now(), endedAt: Date.now() });
    setInput("");
    setStreaming(true);

    const assistantId = newId();
    pushMessage({ id: assistantId, role: "assistant", content: "", streaming: true, startedAt: Date.now(), toolCalls: [] });

    const body: AgentStreamRequest = {
      message,
      provider: activeProvider,
      model: activeModel ?? undefined,
      history: [], // fresh each run — no carryover for one-shot agent mode
      workspace: workspacePath ?? undefined,
      maxSteps: 30, // full agent loop — many more steps than chat
      mode: "agent", // ← full toolset, NOT chat-restricted
    };

    abortRef.current = streamAgent(body, {
      onStep: (step, total) => {
        // The agent's runAbortable loop emits step events.
      },
      onToken: (token) => appendToMessage(assistantId, token),
      onToolCall: (tc) => {
        const id = tc.id || newId();
        addToolCall({
          id, name: tc.name, args: tc.args, status: "running",
          startedAt: Date.now(),
          path: typeof tc.args?.path === "string" ? tc.args.path : undefined,
        });
      },
      onToolResult: (tr) => {
        const id = tr.id || newId();
        updateToolCall(id, {
          status: tr.status === "error" ? "error" : "ok",
          result: tr.result, summary: tr.summary, path: tr.path, endedAt: Date.now(),
        });
      },
      onDone: (payload) => {
        finalizeMessage(assistantId, { content: payload.response });
        setStreaming(false);
        abortRef.current = null;
      },
      onError: (err) => {
        finalizeMessage(assistantId, { error: err, content: `Agent execution failed: ${err}` });
        setStreaming(false);
        abortRef.current = null;
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

  const ok = toolCalls.filter((t) => t.status === "ok").length;
  const err = toolCalls.filter((t) => t.status === "error").length;
  const running = toolCalls.filter((t) => t.status === "running").length;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="max-w-3xl mx-auto p-3 sm:p-4 lg:p-6 pb-32">
          <PageHeader
            title="Agent"
            description="Full agentic execution. All 65 tools, authority gates, trajectory recording. The agent runs autonomously until done() or max_steps. Distinct from Chat (lightweight helper) and Goal (autonomous pursuit)."
            actions={<StatusPill status={isStreaming ? "running" : "idle"} label={isStreaming ? "executing" : "idle"} />}
          />

          {/* Stats */}
          <div className="grid-stats mb-4">
            <StatTile label="Tools available" value="65" hint="full arsenal" />
            <StatTile label="Max steps" value="30" />
            <StatTile label="Completed" value={ok} hint={`${running} running`} />
            <StatTile label="Errors" value={err} />
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="space-y-6">
            {messages.length === 0 ? (
              <EmptyState icon={Bot} title="Describe a task for the agent" hint="The agent has the full tool arsenal — file ops, shell, axodex code-graph, palace memory, git, swarm. It will plan, execute, verify, and report autonomously." />
            ) : (
              messages.map((m) => <MessageView key={m.id} message={m} />)
            )}
            {isStreaming && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono pl-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot glow-accent" />
                <span>agent executing · {running} tool(s) in flight</span>
              </div>
            )}
          </div>

          {/* Tool call timeline (when there are tool calls) */}
          {toolCalls.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Tool Trace</h2>
              <div className="space-y-1.5">
                {toolCalls.map((tc) => (
                  <div key={tc.id} className="rounded-lg glass-panel text-[12px] font-mono p-2 flex items-center gap-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px]",
                      tc.status === "ok" && "bg-accent/15 text-accent",
                      tc.status === "error" && "bg-destructive/15 text-destructive",
                      tc.status === "running" && "bg-foreground/10 text-foreground/60",
                    )}>{tc.status === "ok" ? "✓" : tc.status === "error" ? "✗" : "running"}</span>
                    <span className="font-semibold">{tc.name}</span>
                    {tc.path && <span className="text-muted-foreground truncate">· {tc.path}</span>}
                    {tc.summary && <span className="text-muted-foreground truncate hidden sm:inline">· {tc.summary}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="flex-shrink-0 p-3 sm:p-4 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <div className={cn(
            "relative rounded-2xl glass-elevated transition-all duration-300",
            isStreaming ? "opacity-70" : "hover:shadow-lg",
          )}>
            <Textarea
              ref={textAreaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isStreaming}
              placeholder={isStreaming
                ? "Agent is executing… press Stop to interrupt."
                : "Describe a task — the agent has the full tool arsenal and runs autonomously until done()."}
              className="min-h-[60px] max-h-[220px] resize-none border-0 bg-transparent px-3 sm:px-4 py-3.5 pr-28 text-[13px] sm:text-[14px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/70"
              rows={1}
            />
            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1">
              {messages.length > 0 && !isStreaming && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground press" onClick={clearMessages} aria-label="Clear" title="Clear">
                  <Square className="w-3.5 h-3.5" />
                </Button>
              )}
              {isStreaming ? (
                <Button size="sm" variant="destructive" onClick={cancel} className="h-8 gap-1.5 press">
                  <Square className="w-3 h-3 fill-current" /><span>Stop</span>
                </Button>
              ) : (
                <Button size="sm" onClick={send} disabled={!input.trim()} className="h-8 gap-1.5 press shadow-md shadow-primary/20">
                  <Send className="w-3 h-3" /><span>Run</span>
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-muted-foreground font-mono">
            <span><kbd className="px-1.5 py-0.5 rounded glass-inset text-[9px]">↵</kbd> run · <kbd className="px-1.5 py-0.5 rounded glass-inset text-[9px]">⇧↵</kbd> newline</span>
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
