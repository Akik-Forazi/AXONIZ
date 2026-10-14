"use client";
/**
 * useConversations — persists conversation list to localStorage.
 * Each conversation has: id, title, messages, createdAt, updatedAt.
 */
import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "./use-chat-stream";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "axoniz-conversations-v1";

function load(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(convs: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch {
    /* quota */
  }
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Load on mount
  useEffect(() => {
    const loaded = load();
    setConversations(loaded);
    if (loaded.length > 0 && !activeId) {
      setActiveId(loaded[0].id);
    }
  }, []);

  // Persist on change
  useEffect(() => {
    save(conversations);
  }, [conversations]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const newConversation = useCallback(() => {
    const conv: Conversation = {
      id: uid(),
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        if (id === activeId) {
          setActiveId(filtered[0]?.id ?? null);
        }
        return filtered;
      });
    },
    [activeId]
  );

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c))
    );
  }, []);

  const updateMessages = useCallback(
    (id: string, messages: ChatMessage[]) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          // Auto-title from first user message
          const firstUser = messages.find((m) => m.role === "user");
          const title =
            c.title === "New chat" && firstUser
              ? firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? "…" : "")
              : c.title;
          return { ...c, messages, title, updatedAt: Date.now() };
        })
      );
    },
    []
  );

  return {
    conversations,
    active,
    activeId,
    newConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    updateMessages,
  };
}
