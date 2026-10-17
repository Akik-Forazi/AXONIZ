"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";

import { authedFetch } from "@/lib/axoniz/client";
/**
 * /chat — creates a new chat (or picks the most recent) and redirects
 * to /chat/s/<id>. Like ChatGPT's chatgpt.com/ → chatgpt.com/c/<id>.
 */
export default function ChatRedirect() {
  const router = useRouter();
  const activeChatId = useAxonizStore((s) => s.activeChatId);
  const username = useAxonizStore((s) => s.username);

  useEffect(() => {
    (async () => {
      // If we have an active chat from the store, go there.
      if (activeChatId) {
        router.replace(`/chat/s/${activeChatId}`);
        return;
      }
      // Otherwise, try to load the most recent chat.
      try {
        const r = await authedFetch("/api/axoniz/chats");
        const data = await r.json();
        const recent = data.chats?.[0];
        if (recent) {
          router.replace(`/chat/s/${recent.id}`);
          return;
        }
      } catch { /* ignore */ }
      // No existing chats — create a new one.
      try {
        const r = await authedFetch("/api/axoniz/chats", {
          method: "POST",
          body: JSON.stringify({ username: username ?? "anon" }),
        });
        const chat = await r.json();
        if (chat?.id) {
          router.replace(`/chat/s/${chat.id}`);
          return;
        }
      } catch { /* ignore */ }
      // Fallback: stay at /chat (ChatSection will handle it).
    })();
  }, [router, activeChatId, username]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-xs text-muted-foreground animate-pulse">Loading chat…</div>
    </div>
  );
}
