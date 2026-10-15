"use client";

/**
 * Shareable agent-session route — like /chat/s/<id> but for agent
 * goal-sessions. The chat record has kind:'agent'.
 *
 * URL: /agent/s/<username>_<YYYYMMDDHHmmss>_<8hexhash>
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Bot, ArrowLeft, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/axoniz/zai-chat/markdown";
import { useAxonizStore } from "@/stores/axoniz-store";
import { toast } from "sonner";

interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

interface AgentRecord {
  id: string;
  title: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  provider?: string;
  model?: string;
  kind?: string;
  messages: AgentMessage[];
}

export default function SharedAgentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentRecord | null>(null);
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
      .then((data: AgentRecord) => setAgent(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  function copyShareLink() {
    const url = `${window.location.origin}/agent/s/${params.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Share link copied", { description: url });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function continueInAgent() {
    if (!agent) return;
    setActiveChatId(agent.id);
    router.push("/agent");
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
        <Button variant="outline" size="sm" onClick={() => router.push("/agent")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to agent
        </Button>
      </div>
    );
  }
  if (!agent) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/agent")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Agent
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate flex items-center gap-2">
            <Bot className="w-3.5 h-3.5 text-muted-foreground" />
            {agent.title}
          </h1>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {agent.id} · {agent.messages.length} msgs · kind: {agent.kind ?? "agent"}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={copyShareLink} data-axoniz-action="share-agent-link">
          {copied ? <Check className="w-3.5 h-3.5 mr-1 text-accent" /> : <Share2 className="w-3.5 h-3.5 mr-1" />}
          {copied ? "Copied" : "Share"}
        </Button>
        <Button variant="default" size="sm" onClick={continueInAgent} data-axoniz-action="continue-agent">
          Continue
        </Button>
      </div>

      <div className="px-5 py-2 border-b border-border/50 bg-secondary/20 flex items-center gap-3 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="font-mono text-[10px]">user: {agent.username}</Badge>
        {agent.provider && <Badge variant="outline" className="font-mono text-[10px]">{agent.provider}</Badge>}
        {agent.model && <Badge variant="outline" className="font-mono text-[10px] truncate max-w-[200px]">{agent.model}</Badge>}
        <span className="font-mono">created: {new Date(agent.createdAt).toLocaleString()}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-4 divide-y divide-border/40">
          {agent.messages.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-12">
              This agent session has no messages yet.
            </div>
          )}
          {agent.messages.map(m => (
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
                  {m.role === "user" ? "You" : "AXONIZ Agent"}
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
