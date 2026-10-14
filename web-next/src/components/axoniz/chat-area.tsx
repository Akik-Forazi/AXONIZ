"use client";

import { User, Assistant, Atom } from "lucide-react";
import { useState, useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  pending?: boolean;
}

export function ChatArea() {
  // Manage chat messages locally; dataSource comes from store for status badge
  const { dataSource } = useAxonizStore((s) => ({ dataSource: s.dataSource }));

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content,
        timestamp: Date.now(),
      },
    ]);

    try {
      await fetch("/api/axoniz/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: content, mode: "agent" }),
      });
      // Placeholder until SSE stream completes
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Agent is thinking...",
          timestamp: Date.now(),
          pending: true,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  useEffect(() => {
    // Listen for SSE events that update the assistant message
    const evtSource = new EventSource("/api/axoniz/stream");
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "done") {
          // Agent task completed - update the last pending message
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.pending) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: data.summary || "Task complete",
                  pending: false,
                },
              ];
            }
            return prev;
          });
        }
        if (data.type === "error") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.pending) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: `Error: ${data.error || "Unknown error"}`,
                  pending: false,
                },
              ];
            }
            return prev;
          });
        }
      } catch {}
    };

    return () => evtSource.close();
  }, [messages]);

  return (
    <div className="flex-1 h-[calc(100vh-320px)] overflow-y-auto p-4 sm:p-6 space-y-4">
      <div className="space-y-3">
        {messages.length > 0 && (
          <div>
            {messages.map((msg) => (
              <ChatMessage key={msg.timestamp} msg={msg} />
            ))}
          </div>
        )}
      </div>

      {/* System/status messages */}
      <div className="col-span-2 text-[10px] text-muted-foreground/60 p-3 text-center">
        {dataSource === "live" && (
          "Connected to live backend — events streamed via SSE"
        )}
        {dataSource === "mock" && (
          "Using demo stream — configure a provider in Settings for live chat"
        )}
      </div>
    </div>
  );
}

function ChatMessage({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const isPending = msg.role === "assistant" && msg.pending;
  return (
    <div
      key={msg.timestamp}
      className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-3 ${isPending ? "animate-pulse" : ""}`}
    >
      <div
        className={
          `max-w-[80%] rounded-blg px-4 py-2 ${
            isUser
              ? "bg-primary/10 text-primary border border-primary/20"
              : isPending
              ? "bg-secondary/10 animate-pulse border border-secondary/20"
              : "bg-secondary/10 text-foreground border border-secondary/20"
          }`}
        >
          {msg.content}
        </div>
        <span className="text-[10px] text-muted-foreground/80 capitalize">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </span>
      </div>
  );
}

export function InputArea({ onSend }: { onSend: (content: string) => void }) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(input);
    setInput("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-3 p-3 border-t border-border bg-background/95 backdrop-blur-sm"
    >
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a message..."
        className="flex-1 rounded-md border-border"
      />
      <Button type="submit" className="min-w-[60px]">
        Send
      </Button>
    </form>
  );
}