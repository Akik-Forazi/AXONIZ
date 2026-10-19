"use client";

/**
 * /chat/s/[id] — the LIVE chat interface (not read-only).
 * 
 * This is the ChatGPT-style URL: chatgpt.com/c/<id> = axoniz/chat/s/<id>.
 * The chat ID comes from the URL params, not from the store.
 * ChatSection reads it via useParams() and loads/saves messages
 * from the JSONL file at ~/.fraziym/axoniz/db/chats/<id>.jsonl.
 */

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { ChatSection } from "@/components/axoniz/sections/chat";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const chatId = params.id;
  const setActiveChatId = useAxonizStore((s) => s.setActiveChatId);

  // Sync the URL chatId → store so the sidebar highlights the right entry.
  useEffect(() => {
    if (chatId) {
      setActiveChatId(chatId);
    }
  }, [chatId, setActiveChatId]);

  if (!chatId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-muted-foreground">No chat ID in URL.</div>
      </div>
    );
  }

  return <ChatSection />;
}
