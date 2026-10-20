"use client";

import { useState } from "react";
import { Copy, Check, ChevronRight, ChevronDown, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useAxonizWorkspaceStore, type ChatMessage, type ToolCall } from "@/stores/axoniz-workspace-store";
import { cn } from "@/lib/utils";

export function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap shadow-lg shadow-primary/20">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "assistant") {
    return (
      <div className="flex gap-3 animate-fade-in">
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-[10px] font-bold tracking-tighter shadow-md shadow-primary/30">
          FZ
        </div>
        <div className="flex-1 min-w-0">
          <ToolCallsForMessage message={message} />
          {message.content && (
            <div className="prose prose-sm max-w-none dark:prose-invert text-[13px] leading-relaxed">
              <ReactMarkdown
                components={{
                  code(props) {
                    const { className, children, ...rest } = props;
                    const match = /language-(\w+)/.exec(className ?? "");
                    const inline = !match && !String(children).includes("\n");
                    if (inline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded-md glass-inset font-mono text-[11px]" {...rest}>
                          {children}
                        </code>
                      );
                    }
                    return <CodeBlock language={match?.[1] ?? "text"}>{String(children)}</CodeBlock>;
                  },
                  a: ({ children, ...rest }) => (
                    <a {...rest} className="text-foreground underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5">{children}</ol>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          {message.streaming && !message.content && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <span className="w-1 h-1 rounded-full bg-foreground/50 animate-pulse-dot" />
              <span>thinking…</span>
            </div>
          )}
          {message.error && (
            <div className="text-[12px] text-destructive border-l-2 border-destructive pl-2 mt-1">{message.error}</div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function ToolCallsForMessage({ message }: { message: ChatMessage }) {
  const allToolCalls = useAxonizWorkspaceStore((s) => s.toolCalls);
  const started = message.startedAt ?? 0;
  const ended = message.endedAt ?? Date.now();
  const mine = allToolCalls.filter(
    (tc) => tc.startedAt >= started - 100 && tc.startedAt <= ended + 1000,
  );
  if (mine.length === 0) return null;
  return (
    <div className="space-y-1.5 mb-2">
      {mine.map((tc) => <ToolCallCard key={tc.id} tc={tc} />)}
    </div>
  );
}

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusColor = tc.status === "ok" ? "text-accent"
    : tc.status === "error" ? "text-destructive"
    : tc.status === "running" ? "text-foreground/60" : "text-muted-foreground";
  const statusLabel = tc.status === "ok" ? "✓" : tc.status === "error" ? "✗" : tc.status === "running" ? "running" : tc.status;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tc.result ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="rounded-lg glass-panel text-[12px] font-mono overflow-hidden spring-in">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/40 transition-colors text-left press"
      >
        {expanded ? <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                  : <ChevronRight className="w-3 h-3 flex-shrink-0 text-muted-foreground" />}
        <Wrench className={cn("w-3 h-3 flex-shrink-0", statusColor)} />
        <span className="font-semibold">{tc.name}</span>
        {tc.path && <span className="text-muted-foreground truncate">· {tc.path}</span>}
        {tc.summary && <span className="text-muted-foreground truncate hidden sm:inline">· {tc.summary}</span>}
        <span className={cn(
          "ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded",
          tc.status === "ok" && "bg-accent/15 text-accent",
          tc.status === "error" && "bg-destructive/15 text-destructive",
          tc.status === "running" && "bg-foreground/10 text-foreground/60",
        )}>
          {statusLabel}
        </span>
      </button>
      {expanded && tc.result && (
        <div className="glass-inset px-3 py-2.5 relative max-h-64 overflow-y-auto">
          <Button variant="ghost" size="icon"
            className="absolute right-1 top-1 h-6 w-6" onClick={copy} aria-label="Copy result">
            {copied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
          </Button>
          <pre className="text-[11px] whitespace-pre-wrap break-words pr-6">{tc.result}</pre>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div className="relative my-3 rounded-xl glass-inset overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{language}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 press" onClick={copy} aria-label="Copy code">
          {copied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={theme === "dark" ? oneDark : oneLight}
        customStyle={{ margin: 0, background: "transparent", fontSize: "11.5px", padding: "0.75rem 1rem", lineHeight: 1.55 }}
        wrapLongLines
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
