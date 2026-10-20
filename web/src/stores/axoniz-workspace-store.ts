"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ────────────────────────────────────────────────────────────────────────────
// AXONIZ workspace runtime state.
// Layout (panel sizes + view selections) is persisted so the user's
// arrangement survives refresh. Chat/tool/tab/terminal state is ephemeral.
// ────────────────────────────────────────────────────────────────────────────

export type Role = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  refs?: string[];
  streaming?: boolean;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  toolCalls?: ToolCall[];
}

export type ToolStatus = "running" | "ok" | "error" | "blocked" | "cancelled";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  summary?: string;
  result?: string;
  status: ToolStatus;
  startedAt: number;
  endedAt?: number;
  path?: string;
}

export interface FileTab {
  path: string;
  content: string;
  language?: string;
  readOnly?: boolean;
  binary?: boolean;
}

export interface TerminalLine {
  id: string;
  kind: "command" | "stdout" | "stderr" | "info" | "error" | "success";
  text: string;
  ts: number;
}

export interface SessionMeta {
  id: string;
  title: string;
  ts: string;
  path?: string;
  messageCount?: number;
}

const DEFAULT_LAYOUT = {
  leftPanelOpen: true,        // left = menu bar (icon strip)
  terminalPanelOpen: true,   // right = terminal panel
  terminalSize: 28,          // % of total width (right terminal panel)
  editorSize: 38,             // % of the center column height (editor above chat)
};

interface AXONIZState {
  workspacePath: string | null;
  setWorkspace: (path: string | null) => void;

  // ── Layout (persisted) ────────────────────────────────────────────────────
  leftPanelOpen: boolean;       // controls the LEFT menu bar visibility
  terminalPanelOpen: boolean;   // controls the RIGHT terminal visibility
  toggleLeftPanel: () => void;
  toggleTerminalPanel: () => void;
  setLeftPanelOpen: (v: boolean) => void;
  setTerminalPanelOpen: (v: boolean) => void;

  terminalSize: number;
  editorSize: number;
  setTerminalSize: (n: number) => void;
  setEditorSize: (n: number) => void;
  resetLayout: () => void;

  // ── Chat (ephemeral) ───────────────────────────────────────────────────────
  messages: ChatMessage[];
  pushMessage: (m: ChatMessage) => void;
  appendToMessage: (id: string, chunk: string) => void;
  finalizeMessage: (id: string, patch?: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  // ── Agent / tools ──────────────────────────────────────────────────────────
  isStreaming: boolean;
  setStreaming: (v: boolean) => void;
  toolCalls: ToolCall[];
  addToolCall: (tc: ToolCall) => void;
  updateToolCall: (id: string, patch: Partial<ToolCall>) => void;

  // ── File tabs ──────────────────────────────────────────────────────────────
  openTabs: FileTab[];
  activeTabPath: string | null;
  openFile: (tab: FileTab) => void;
  closeFile: (path: string) => void;
  setActiveTab: (path: string) => void;
  closeAllFiles: () => void;

  // ── Sessions ───────────────────────────────────────────────────────────────
  sessions: SessionMeta[];
  setSessions: (s: SessionMeta[]) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;

  // ── Terminal ──────────────────────────────────────────────────────────────
  terminalLines: TerminalLine[];
  pushTerminalLine: (l: TerminalLine) => void;
  clearTerminal: () => void;

  // ── Model picker ───────────────────────────────────────────────────────────
  modelPickerOpen: boolean;
  openModelPicker: () => void;
  closeModelPicker: () => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useAxonizWorkspaceStore = create<AXONIZState>()(
  persist(
    (set) => ({
      workspacePath: null,
      setWorkspace: (workspacePath) => set({ workspacePath }),

      ...DEFAULT_LAYOUT,
      toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleTerminalPanel: () => set((s) => ({ terminalPanelOpen: !s.terminalPanelOpen })),
      setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
      setTerminalPanelOpen: (terminalPanelOpen) => set({ terminalPanelOpen }),

      setTerminalSize: (terminalSize) => set({ terminalSize }),
      setEditorSize: (editorSize) => set({ editorSize }),
      resetLayout: () => set({ ...DEFAULT_LAYOUT }),

      messages: [],
      pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      appendToMessage: (id, chunk) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + chunk } : m,
          ),
        })),
      finalizeMessage: (id, patch) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, streaming: false, endedAt: Date.now(), ...patch } : m,
          ),
        })),
      clearMessages: () => set({ messages: [], toolCalls: [] }),

      isStreaming: false,
      setStreaming: (isStreaming) => set({ isStreaming }),
      toolCalls: [],
      addToolCall: (tc) => set((s) => ({ toolCalls: [...s.toolCalls, tc] })),
      updateToolCall: (id, patch) =>
        set((s) => ({
          toolCalls: s.toolCalls.map((tc) => (tc.id === id ? { ...tc, ...patch } : tc)),
        })),

      openTabs: [],
      activeTabPath: null,
      openFile: (tab) =>
        set((s) => {
          const exists = s.openTabs.find((t) => t.path === tab.path);
          if (exists) {
            return {
              openTabs: s.openTabs.map((t) => (t.path === tab.path ? { ...t, ...tab } : t)),
              activeTabPath: tab.path,
            };
          }
          return { openTabs: [...s.openTabs, tab], activeTabPath: tab.path };
        }),
      closeFile: (path) =>
        set((s) => {
          const next = s.openTabs.filter((t) => t.path !== path);
          const activeTabPath = s.activeTabPath === path ? (next[0]?.path ?? null) : s.activeTabPath;
          return { openTabs: next, activeTabPath };
        }),
      setActiveTab: (path) => set({ activeTabPath: path }),
      closeAllFiles: () => set({ openTabs: [], activeTabPath: null }),

      sessions: [],
      setSessions: (sessions) => set({ sessions }),
      activeSessionId: null,
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),

      terminalLines: [],
      pushTerminalLine: (l) =>
        set((s) => ({ terminalLines: [...s.terminalLines, l].slice(-300) })),
      clearTerminal: () => set({ terminalLines: [] }),

      modelPickerOpen: false,
      openModelPicker: () => set({ modelPickerOpen: true }),
      closeModelPicker: () => set({ modelPickerOpen: false }),
    }),
    {
      name: "axoniz-layout-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        leftPanelOpen: s.leftPanelOpen,
        terminalPanelOpen: s.terminalPanelOpen,
        terminalSize: s.terminalSize,
        editorSize: s.editorSize,
      }),
      version: 2,
    },
  ),
);

export const newId = uid;
