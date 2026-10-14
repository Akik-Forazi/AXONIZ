"use client";

import { User, Assistant, Atom, type LucideIcon } from "lucide-react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { axiosInstance } from "@/lib/axoniz/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  avatar?: LucideIcon;
  className?: string;
}

function useConversation() {
  const { activeModel, activeProvider, dataSource } = useAxonizStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: content,
        timestamp: Date.now(),
        avatar: User,
      },
    ]);

    try {
      const response = await axiosInstance.post("/api/axoniz/chat", {
        message: content,
        mode: "agent",
      });

      const taskId = response.data.taskId;
      // TODO: In a full implementation, we would SSE-stream the response
      // and add assistant tokens as they arrive. For now, we'll wait for
      // the task to complete and add the final response.

      // Poll for completion or rely on SSE later
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Task ${taskId} started. Processing your request...`,
          timestamp: Date.now(),
          avatar: Assistant,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
          avatar: Assistant,
        },
      ]);
    }
  };

  return { messages, sendMessage };
}

export function ChatArea() {
  const { messages, sendMessage } = useConversation();

  return (
    <div className="flex-1 h-[calc(100vh-320px)] overflow-y-auto p-4 sm:p-6 space-y-4">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} items-start gap-3`}
        >
          <div
            className={
              `max-w-[80%] rounded-blg px-4 py-2 ${
                msg.role === "user"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : msg.role === "assistant"
                  ? "bg-secondary/10 text-foreground border border-secondary/20"
                  : "bg-muted/8 text-foreground border border-muted/30"
              } ${msg.className ?? ""}`
            }
          >
            {msg.avatar && (
              <span className="absolute -top-1 -right-2 w-5 h-5 rounded-full ${
                msg.role === "user" ? "bg-primary" : "bg-secondary"
              } flex items-center justify-center text-[10px] font-medium">
                {msg.role === "user" ? "U" : "A"}
              </span>
            )}
            <span className="text-sm {msg.role === "user" ? "text-primary" : "text-foreground"}">
              {msg.content}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/80 capitalize">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}

      {/* System messages or status */}
      {dataSource === "live" && (
        <div className="col-span-2 text-[10px] text-muted-foreground/60 p-3 text-center">
          Connected to live backend — events streamed via SSE
        </div>
      )}
      {dataSource === "mock" && (
        <div className="col-span-2 text-[10px] text-muted-foreground/60 p-3 text-center">
          Using demo stream — configure a provider in Settings for live chat
        </div>
      )}
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