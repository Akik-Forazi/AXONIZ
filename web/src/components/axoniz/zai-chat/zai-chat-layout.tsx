"use client";
/**
 * Z.AI-style chat layout — full-screen layout that composes:
 *   - Left sidebar (conversation list)
 *   - Top bar (sidebar toggle, model picker, theme toggle)
 *   - Main area:
 *     - Empty state when no messages
 *     - Message list + streaming when messages exist
 *   - Bottom input area (always visible)
 *
 * Wires to the existing /api/axoniz/chat SSE backend via useChatStream.
 * Conversations persist to localStorage via useConversations.
 */
import { useEffect, useRef } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { useChatStream } from "./use-chat-stream";
import { useConversations } from "./use-conversations";
import { ChatSidebar } from "./chat-sidebar";
import { ChatTopBar } from "./chat-topbar";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { ChatEmptyState } from "./chat-empty-state";

export function ZaiChatLayout() {
  const token = useAxonizStore((s) => s.token);
  const username = useAxonizStore((s) => s.username);
  const sidebarCollapsed = useAxonizStore((s) => s.sidebarCollapsed);

  const {
    conversations,
    active,
    activeId,
    newConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    updateMessages,
  } = useConversations();

  // Pass the active chat ID to useChatStream (ChatGPT-style — the hook
  // loads messages from JSONL on disk, not from in-memory state).
  const stream = useChatStream(activeId);

  // When the active conversation changes, reset the stream hook's messages
  // by replacing its state. We use a key on the layout to remount.
  // Easier: sync messages → conversation on every change.
  const lastSyncId = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && lastSyncId.current !== activeId) {
      lastSyncId.current = activeId;
      // Set stream messages to the conversation's stored messages
      stream.setMessages(() => (active?.messages ?? []).map((m) => ({ ...m })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Persist messages back to conversation whenever they change
  useEffect(() => {
    if (activeId) {
      updateMessages(activeId, stream.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.messages, activeId]);

  // Auto-create first conversation if empty
  useEffect(() => {
    if (conversations.length === 0) {
      newConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);

  const handleSend = (content: string) => {
    if (!activeId) {
      const conv = newConversation();
      // Wait for state update then send
      setTimeout(() => stream.send(content), 0);
      return;
    }
    stream.send(content);
  };

  const handlePickSuggestion = (prompt: string) => {
    handleSend(prompt);
  };

  const hasMessages = stream.messages.length > 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {!sidebarCollapsed && (
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onNew={newConversation}
          onSelect={selectConversation}
          onDelete={deleteConversation}
          onRename={renameConversation}
        />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <ChatTopBar />
        {hasMessages ? (
          <ChatMessages
            messages={stream.messages}
            isStreaming={stream.isStreaming}
            onRegenerate={stream.regenerate}
          />
        ) : (
          <ChatEmptyState onPick={handlePickSuggestion} />
        )}
        <ChatInput
          onSend={handleSend}
          onStop={stream.stop}
          isStreaming={stream.isStreaming}
        />
      </div>
    </div>
  );
}
