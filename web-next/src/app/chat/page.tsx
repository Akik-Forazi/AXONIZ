"use client";
/**
 * Chat page — full-screen z.ai-style chat layout.
 * Bypasses the (auth) dashboard layout for a full-viewport chat experience.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";
import { ZaiChatLayout } from "@/components/axoniz/zai-chat/zai-chat-layout";

export default function ChatPage() {
  const token = useAxonizStore((s) => s.token);
  const router = useRouter();

  useEffect(() => {
    if (!token) router.replace("/");
  }, [token, router]);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Redirecting to login...
      </div>
    );
  }

  return <ZaiChatLayout />;
}
