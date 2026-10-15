"use client";
/**
 * useConversations — backend-persisted chat list.
 *
 * Each conversation is stored on the user's filesystem at
 * ~/.axoniz/chats/<id>.json (see src/lib/axoniz/chat-store.ts).
 * The ID has format <username>_<YYYYMMDDHHmmss>_<8hexhash> and is
 * URL-safe — used in the shareable route /chat/s/<id>.
 *
 * The hook keeps an in-memory mirror of the backend list (so the UI
 * renders instantly) and pushes changes to the backend via:
 *   POST   /api/axoniz/chats         — create
 *   GET    /api/axoniz/chats         — list (metadata only)
 *   PUT    /api/axoniz/chats/[id]    — update title/messages
 *   DELETE /api/axoniz/chats/[id]    — delete
 *
 * The store's activeChatId is the source of truth for which chat is
 * currently active — set here, mirrored in the persist middleware so
 * it survives reloads.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import type { ChatMessage } from "./use-chat-stream";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  username?: string;
  provider?: string;
  model?: string;
}

interface BackendChatMetadata {
  id: string;
  title: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  provider?: string;
  model?: string;
}

interface BackendChatRecord extends Conversation {}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const username = useAxonizStore((s) => s.username);
  const storeActiveChatId = useAxonizStore((s) => s.activeChatId);
  const setStoreActiveChatId = useAxonizStore((s) => s.setActiveChatId);
  const activeProvider = useAxonizStore((s) => s.activeProvider);
  const activeModel = useAxonizStore((s) => s.activeModel);
  // Save queue — debounce so we don't PUT after every keystroke / token.
  const saveQueueRef = useRef<Map<string, Conversation>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load list on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/axoniz/chats");
        const data = await r.json();
        if (cancelled) return;
        const list: Conversation[] = (data.chats ?? []).map((m: BackendChatMetadata) => ({
          id: m.id,
          title: m.title,
          messages: [], // messages are loaded lazily when chat is opened
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          username: m.username,
          provider: m.provider,
          model: m.model,
        }));
        setConversations(list);
        // Restore the last-active chat from the store if it still exists.
        const persisted = storeActiveChatId && list.some(c => c.id === storeActiveChatId)
          ? storeActiveChatId
          : (list[0]?.id ?? null);
        setActiveId(persisted);
        if (persisted) setStoreActiveChatId(persisted);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user clicks "Continue in chat" from /chat/s/<id>, storeActiveChatId
  // changes — sync the local activeId and load the full chat.
  useEffect(() => {
    if (storeActiveChatId && storeActiveChatId !== activeId) {
      setActiveId(storeActiveChatId);
      // If we don't have messages for it yet, fetch them.
      const existing = conversations.find(c => c.id === storeActiveChatId);
      if (existing && existing.messages.length === 0) {
        void loadMessages(storeActiveChatId);
      } else if (!existing) {
        // New chat from elsewhere — add a stub to the list.
        setConversations(prev => [
          { id: storeActiveChatId, title: "Loading…", messages: [], createdAt: Date.now(), updatedAt: Date.now() },
          ...prev,
        ]);
        void loadMessages(storeActiveChatId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeActiveChatId]);

  async function loadMessages(id: string) {
    try {
      const r = await fetch(`/api/axoniz/chats/${id}`);
      if (!r.ok) return;
      const record: BackendChatRecord = await r.json();
      setConversations(prev => prev.map(c => c.id === id ? {
        ...c,
        title: record.title,
        messages: record.messages,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        provider: record.provider,
        model: record.model,
      } : c));
    } catch { /* ignore — leave the stub */ }
  }

  // Flush the save queue (debounced).
  function scheduleFlush() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const queue = saveQueueRef.current;
      saveQueueRef.current = new Map();
      saveTimerRef.current = null;
      for (const [id, conv] of queue) {
        fetch(`/api/axoniz/chats/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: conv.title,
            messages: conv.messages,
            provider: conv.provider ?? activeProvider,
            model: conv.model ?? activeModel,
          }),
          keepalive: true,
        }).catch(() => { /* re-queue? for now just drop */ });
      }
    }, 600);
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;

  /** Create a new chat on the backend. Returns the new conversation. */
  const newConversation = useCallback(async (): Promise<Conversation> => {
    try {
      const r = await fetch("/api/axoniz/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username ?? "anon" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const record: BackendChatRecord = await r.json();
      const conv: Conversation = {
        id: record.id,
        title: record.title,
        messages: record.messages,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        username: record.username,
        provider: record.provider,
        model: record.model,
      };
      setConversations(prev => [conv, ...prev]);
      setActiveId(conv.id);
      setStoreActiveChatId(conv.id);
      return conv;
    } catch (e) {
      // Fallback: create a local-only conversation so the UI still works.
      const fallback: Conversation = {
        id: `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title: "New chat (offline)",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations(prev => [fallback, ...prev]);
      setActiveId(fallback.id);
      setStoreActiveChatId(fallback.id);
      return fallback;
    }
  }, [username, setStoreActiveChatId, activeProvider, activeModel]);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setStoreActiveChatId(id);
    // Lazy-load messages if we don't have them yet.
    const existing = conversations.find(c => c.id === id);
    if (existing && existing.messages.length === 0) {
      void loadMessages(id);
    }
  }, [conversations, setStoreActiveChatId]);

  const deleteConversation = useCallback(async (id: string) => {
    // Optimistic remove.
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (id === activeId) {
        const next = filtered[0]?.id ?? null;
        setActiveId(next);
        setStoreActiveChatId(next);
      }
      return filtered;
    });
    try {
      await fetch(`/api/axoniz/chats/${id}`, { method: "DELETE" });
    } catch { /* already removed from UI */ }
  }, [activeId, setStoreActiveChatId]);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title, updatedAt: Date.now() } : c));
    // Queue for backend save.
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      saveQueueRef.current.set(id, { ...conv, title });
      scheduleFlush();
    }
  }, [conversations]);

  const updateMessages = useCallback((id: string, messages: ChatMessage[]) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== id) return c;
      // Auto-title from first user message.
      const firstUser = messages.find(m => m.role === "user");
      const title = c.title === "New chat" && firstUser
        ? (firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? "…" : ""))
        : c.title;
      return { ...c, messages, title, updatedAt: Date.now() };
    }));
    // Queue for backend save.
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      const firstUser = messages.find(m => m.role === "user");
      const newTitle = conv.title === "New chat" && firstUser
        ? (firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? "…" : ""))
        : conv.title;
      saveQueueRef.current.set(id, { ...conv, messages, title: newTitle });
      scheduleFlush();
    }
  }, [conversations]);

  return {
    conversations,
    active,
    activeId,
    loading,
    error,
    newConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    updateMessages,
  };
}
