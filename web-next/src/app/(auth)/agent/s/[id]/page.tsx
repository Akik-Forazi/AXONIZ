"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { AgentPage } from "@/components/axoniz/pages/agent";

export default function AgentSessionPage() {
  const params = useParams<{ id: string }>();
  const chatId = params.id;
  const setActiveChatId = useAxonizStore((s) => s.setActiveChatId);

  useEffect(() => {
    if (chatId) setActiveChatId(chatId);
  }, [chatId, setActiveChatId]);

  if (!chatId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">No agent session ID.</div>
      </div>
    );
  }

  return <AgentPage />;
}
