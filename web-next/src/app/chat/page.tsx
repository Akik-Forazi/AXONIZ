"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";
import { ChatArea, InputArea } from "@/components/axoniz/chat-area";

export default function ChatPage() {
  const token = useAxonizStore((s) => s.token);
  const router = useRouter();

  useEffect(() => {
    if (!token) router.replace("/");
  }, [token, router]);

  // Pull dataSource from store for the status badge.
  const dataSource = useAxonizStore((s) => s.dataSource);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ChatArea dataSource={dataSource} />
      <InputArea onSend={(content) => {
        // Send message to the axoniz backend.
        fetch("/api/axoniz/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: content, mode: "agent" }),
        });
      }} />
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