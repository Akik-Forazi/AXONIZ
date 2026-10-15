"use client";

/**
 * Shareable chat route — displays a saved chat by ID.
 *
 * URL format: /chat/s/<username>_<YYYYMMDDHHmmss>_<8hexhash>
 *   Example: /chat/s/akik_20261014231015_a3f9b2c1
 *
 * This is the AXONIZ equivalent of z.ai's /c/<chat_id> links.
 * Chats are stored on the user's local filesystem at
 * ~/.axoniz/chats/<id>.json — there is no remote server, so the
 * link only works on the machine that created it.
 *
 * The page fetches GET /api/axoniz/chats/[id] and renders the
 * message history read-only (with a "Continue in chat" button that
 * switches the active chat to this one and opens /chat).
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, MessageSquare, ArrowLeft, Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/axoniz/zai-chat/markdown";
import { useAxonizStore } from "@/stores/axoniz-store";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

interface ChatRecord {
  id: string;
  title: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  provider?: string;
  model?: string;
  messages: ChatMessage[];
}

export default function SharedChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [chat, setChat] = useState<ChatRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const setActiveChatId = useAxonizStore((s) => s.setActiveChatId);

  useEffect(() => {
    const id = params.id;
    if (!id) return;
    fetch(`/api/axoniz/chats/${id}`)
      .then(async r => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: ChatRecord) => setChat(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  function copyShareLink() {
    const url = `${window.location.origin}/chat/s/${params.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Share link copied", { description: url });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function continueInChat() {
    if (!chat) return;
    setActiveChatId(chat.id);
    router.push("/chat");
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6">
        <div className="text-sm text-destructive">{error}</div>
        <Button variant="outline" size="sm" onClick={() => router.push("/chat")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to chat
        </Button>
      </div>
    );
  }
  if (!chat) return null;

  const createdAt = new Date(chat.createdAt).toLocaleString();
  const updatedAt = new Date(chat.updatedAt).toLocaleString();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/chat")} data-axoniz-action="back-to-chat">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Chat
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
            {chat.title}
          </h1>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {chat.id} · {chat.messages.length} msgs
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={copyShareLink} data-axoniz-action="share-chat-link">
          {copied ? <Check className="w-3.5 h-3.5 mr-1 text-accent" /> : <Share2 className="w-3.5 h-3.5 mr-1" />}
          {copied ? "Copied" : "Share"}
        </Button>
        <Button variant="default" size="sm" onClick={continueInChat} data-axoniz-action="continue-chat">
          Continue in chat
        </Button>
      </div>

      {/* Meta bar */}
      <div className="px-5 py-2 border-b border-border/50 bg-secondary/20 flex items-center gap-3 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="font-mono text-[10px]">user: {chat.username}</Badge>
        {chat.provider && <Badge variant="outline" className="font-mono text-[10px]">{chat.provider}</Badge>}
        {chat.model && <Badge variant="outline" className="font-mono text-[10px] truncate max-w-[200px]">{chat.model}</Badge>}
        <span className="font-mono">created: {createdAt}</span>
        <span className="font-mono">updated: {updatedAt}</span>
      </div>

      {/* Messages (read-only) */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-4 divide-y divide-border/40">
          {chat.messages.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-12">
              This chat has no messages yet.
            </div>
          )}
          {chat.messages.map(m => (
            <div
              key={m.id}
              className={`flex gap-3 px-6 py-3 ${m.role === "user" ? "justify-end" : ""}`}
            >
              {m.role === "assistant" && (
                <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-mono">
                  AX
                </div>
              )}
              <div className={`min-w-0 flex-1 ${m.role === "user" ? "text-right" : ""}`}>
                <div className="text-[10px] text-muted-foreground mb-1">
                  {m.role === "user" ? "You" : "AXONIZ"}
                  {m.timestamp && ` · ${new Date(m.timestamp).toLocaleTimeString()}`}
                </div>
                <div className={`text-[13px] ${m.role === "user" ? "bg-secondary/50 rounded-md px-3 py-2 inline-block max-w-full" : ""}`}>
                  {m.role === "assistant" ? <Markdown content={m.content} /> : m.content}
                </div>
              </div>
              {m.role === "user" && (
                <div className="size-7 shrink-0 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-mono">
                  U
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
