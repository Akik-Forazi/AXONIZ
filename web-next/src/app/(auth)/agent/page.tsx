"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";

/**
 * /agent — creates a new agent session (or picks the most recent
 * kind:'agent' chat) and redirects to /agent/s/<id>.
 * Same pattern as /chat → /chat/s/<id>.
 */
export default function AgentRedirect() {
  const router = useRouter();
  const activeChatId = useAxonizStore((s) => s.activeChatId);
  const username = useAxonizStore((s) => s.username);

  useEffect(() => {
    (async () => {
      // Try to find the most recent agent session.
      try {
        const r = await fetch("/api/axoniz/chats");
        const data = await r.json();
        const agentChat = (data.chats ?? []).find((c: { kind?: string }) => c.kind === "agent");
        if (agentChat) {
          router.replace(`/agent/s/${agentChat.id}`);
          return;
        }
      } catch { /* ignore */ }
      // No agent session — create one.
      try {
        const r = await fetch("/api/axoniz/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username ?? "anon", kind: "agent" }),
        });
        const chat = await r.json();
        if (chat?.id) {
          router.replace(`/agent/s/${chat.id}`);
          return;
        }
      } catch { /* ignore */ }
    })();
  }, [router, activeChatId, username]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-sm text-muted-foreground animate-pulse">Loading agent…</div>
    </div>
  );
}
