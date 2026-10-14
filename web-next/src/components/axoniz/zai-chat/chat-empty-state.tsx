"use client";
/**
 * Chat empty state — z.ai-style greeting + 4 suggestion tiles.
 */
import { Sparkles, Code, BookOpen, Lightbulb } from "lucide-react";
import { useAxonizStore } from "@/stores/axoniz-store";

const SUGGESTIONS = [
  {
    icon: Sparkles,
    title: "Brainstorm ideas",
    prompt: "Help me brainstorm 5 names for a developer-tool startup focused on local-first AI",
  },
  {
    icon: Code,
    title: "Write code",
    prompt: "Write a TypeScript function that debounces an async function with cancellation support",
  },
  {
    icon: BookOpen,
    title: "Explain a concept",
    prompt: "Explain how WebTransport differs from WebSockets, with concrete use cases for each",
  },
  {
    icon: Lightbulb,
    title: "Solve a problem",
    prompt: "My Next.js production build is failing with 'Module not found' — how do I debug this?",
  },
];

export function ChatEmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const username = useAxonizStore((s) => s.username);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = username ? `, ${username}` : "";

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="size-16 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-violet-500/20 mb-6">
        A
      </div>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-1.5 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
        {greeting}{displayName}
      </h1>
      <p className="text-muted-foreground text-sm sm:text-base mb-8">
        How can I help you today?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.title}
              onClick={() => onPick(s.prompt)}
              className="group flex flex-col gap-1 p-4 rounded-xl border border-border bg-card hover:bg-accent/30 hover:border-foreground/20 transition-all text-left"
            >
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
  );
}
