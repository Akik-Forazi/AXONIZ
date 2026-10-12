"use client";
/**
 * Chat message list — renders user bubbles + assistant markdown + streaming cursor.
 * Auto-scrolls to bottom on new tokens.
 */
import { useEffect, useRef, useState } from "react";
import { User, Bot, Copy, Check, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./use-chat-stream";
import { Markdown } from "./markdown";

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  onRegenerate?: () => void;
  onCopy?: (content: string) => void;
}

function StreamingCursor() {
  return (
    <span className="inline-block w-1.5 h-3.5 bg-foreground/80 ml-0.5 animate-pulse rounded-[1px]" />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="size-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
      title="Copy"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function UserMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-end gap-3 px-4 sm:px-6 py-3">
      <div className="max-w-[80%] sm:max-w-[70%]">
        <div className="bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl rounded-tr-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
          {msg.content}
        </div>
        <div className="text-[10px] text-muted-foreground/60 text-right mt-1 mr-1">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white">
        <User className="size-3.5" />
      </div>
    </div>
  );
}

function AssistantMessage({
  msg,
  isStreaming,
  onRegenerate,
}: {
  msg: ChatMessage;
  isStreaming: boolean;
  onRegenerate?: () => void;
}) {
  const showCursor = isStreaming && msg.pending;
  const showActions = !msg.pending && msg.content.length > 0;
  return (
    <div className="flex gap-3 px-4 sm:px-6 py-3 group">
      <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white">
        <Bot className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0 max-w-[calc(100%-3rem)]">
        {msg.error ? (
          <div className="flex items-start gap-2 text-sm text-red-500 dark:text-red-400">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{msg.content}</span>
          </div>
        ) : msg.content ? (
          <>
            <div className="text-sm leading-relaxed">
              <Markdown content={msg.content} />
              {showCursor && <StreamingCursor />}
            </div>
            {showActions && (
              <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={msg.content} />
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="size-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                    title="Regenerate"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex gap-1">
              <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
              <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
              <span className="size-1.5 rounded-full bg-current animate-bounce" />
            </span>
            {msg.pending ? "Thinking..." : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatMessages({ messages, isStreaming, onRegenerate }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  // Track if user is near bottom (sticky scroll)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStick(distFromBottom < 100);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stick) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, stick]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
    >
      <div className="max-w-3xl mx-auto py-4 divide-y divide-border/40">
        {messages.map((m) =>
          m.role === "user" ? (
            <UserMessage key={m.id} msg={m} />
          ) : (
            <AssistantMessage
              key={m.id}
              msg={m}
              isStreaming={isStreaming}
              onRegenerate={onRegenerate}
            />
          )
        )}
      </div>
      <div ref={endRef} className="h-2" />
    </div>
  );
}
