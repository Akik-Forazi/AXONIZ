"use client";
/**
 * Chat input area — z.ai-style growing textarea with mode toggles + send button.
 */
import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Square, Paperclip, Brain, Globe, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";

interface Props {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const MODES = [
  { id: "think", label: "Think", icon: Brain },
  { id: "search", label: "DeepSearch", icon: Globe },
] as const;

export function ChatInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"none" | "think" | "search">("none");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { activeProvider, activeModel, providers } = useAxonizStore();
  const providerMeta = PROVIDER_CATALOG.find((p) => p.id === activeProvider);
  const modelLabel = activeModel || providers[activeProvider]?.model || providerMeta?.popularModels[0] || "default";

  // Auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!value.trim() || isStreaming || disabled) return;
    onSend(value);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="max-w-3xl mx-auto">
        <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:border-foreground/30 transition-colors">
          {/* Mode badge above the input */}
          <div className="flex items-center gap-2 px-3 pt-2.5 text-[11px] text-muted-foreground">
            <span className="font-mono">
              {providerMeta?.name ?? activeProvider} · {modelLabel}
            </span>
            <span className="opacity-40">·</span>
            <span>
              {mode === "think" && "Thinking mode active"}
              {mode === "search" && "DeepSearch active"}
              {mode === "none" && "Press Enter to send, Shift+Enter for new line"}
            </span>
          </div>

          {/* Textarea */}
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything"
            rows={1}
            disabled={disabled}
            className="w-full resize-none bg-transparent border-0 px-3 pt-2 pb-1 text-sm focus:outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
            style={{ minHeight: "40px", maxHeight: "240px" }}
          />

          {/* Bottom row: mode toggles + send button */}
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button
              type="button"
              className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              title="Attach file"
            >
              <Paperclip className="size-4" />
            </button>
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(active ? "none" : (m.id as typeof mode))}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  title={m.label}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              title="Voice"
            >
              <Mic className="size-4" />
            </button>

            <div className="ml-auto">
              {isStreaming ? (
                <button
                  onClick={onStop}
                  className="size-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-80"
                  title="Stop generating"
                >
                  <Square className="size-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => submit()}
                  disabled={!value.trim() || disabled}
                  className="size-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-80 disabled:opacity-30"
                  title="Send"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="text-center text-[10px] text-muted-foreground/60 mt-2">
          AXONIZ can make mistakes. Verify important information.
          {providerMeta?.category === "local" && (
            <span className="ml-1 text-emerald-500/80">● Local model — 100% offline</span>
          )}
        </div>
      </div>
    </div>
  );
}
