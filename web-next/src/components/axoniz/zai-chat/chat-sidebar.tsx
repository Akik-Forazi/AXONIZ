"use client";
/**
 * Chat sidebar — left rail with "New chat" button + conversation list.
 * Matches z.ai's visual style: dark, compact, hover-to-reveal delete.
 */
import { Plus, MessageSquare, Trash2, Edit3, Check, X } from "lucide-react";
import { useState } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { cn } from "@/lib/utils";
import type { Conversation } from "./use-conversations";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function ChatSidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
  onRename,
}: Props) {
  const sidebarCollapsed = useAxonizStore((s) => s.sidebarCollapsed);
  const username = useAxonizStore((s) => s.username);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (sidebarCollapsed) return null;

  const startEdit = (c: Conversation) => {
    setEditingId(c.id);
    setEditValue(c.title);
  };
  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  // Group by date
  const groups: Record<string, Conversation[]> = {};
  for (const c of conversations) {
    const d = new Date(c.updatedAt);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    let key = "Older";
    if (d.toDateString() === today.toDateString()) key = "Today";
    else if (d.toDateString() === yesterday.toDateString()) key = "Yesterday";
    else key = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-zinc-50 dark:bg-zinc-950/40 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
        <div className="size-7 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
          A
        </div>
        <span className="font-semibold text-sm">AXONIZ</span>
        <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          v0.1.3
        </span>
      </div>

      {/* New chat button */}
      <div className="p-2">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-zinc-900 border border-border hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <Plus className="size-4" />
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-4">
        {conversations.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8 px-4">
            No conversations yet.
            <br />
            Click <span className="font-semibold">New chat</span> to start.
          </div>
        )}
        {Object.entries(groups).map(([label, items]) => (
          <div key={label}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
              {label}
            </div>
            <div className="space-y-0.5">
              {items.map((c) => {
                const isActive = c.id === activeId;
                const isEditing = editingId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => !isEditing && onSelect(c.id)}
                    className={cn(
                      "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-sm transition-colors",
                      isActive
                        ? "bg-zinc-200/70 dark:bg-zinc-800/80 text-foreground"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MessageSquare className="size-3.5 shrink-0 opacity-60" />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 bg-transparent border-b border-border focus:outline-none text-xs px-0.5"
                      />
                    ) : (
                      <span className="flex-1 truncate text-xs">{c.title || "Untitled"}</span>
                    )}
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); commitEdit(); }}
                          className="size-5 flex items-center justify-center rounded hover:bg-zinc-300 dark:hover:bg-zinc-700"
                        >
                          <Check className="size-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                          className="size-5 flex items-center justify-center rounded hover:bg-zinc-300 dark:hover:bg-zinc-700"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                          className="size-5 flex items-center justify-center rounded hover:bg-zinc-300 dark:hover:bg-zinc-700"
                          title="Rename"
                        >
                          <Edit3 className="size-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                          className="size-5 flex items-center justify-center rounded hover:bg-red-500/20 text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User footer */}
      <div className="border-t border-border p-2">
        <div className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer">
          <div className="size-7 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold uppercase">
            {(username || "U").slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{username || "User"}</div>
            <div className="text-[10px] text-muted-foreground">Free plan</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
