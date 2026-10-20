"use client";

import { useEffect } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ChatPanel } from "@/components/axoniz/chat-panel";
import { TerminalPanel } from "@/components/axoniz/terminal-panel";
import { FileEditorArea } from "@/components/axoniz/file-editor-area";
import { useAxonizWorkspaceStore } from "@/stores/axoniz-workspace-store";
import { listWorkspace, getGitLog, listSessions } from "@/lib/axoniz/client";

/**
 * Chat Workspace — the `/` route.
 *
 * Layout inside the main area (the shell already renders TopBar + MenuBar):
 *   ┌─────────────────────────┬───────────┐
 *   │  File Editor (when open) │           │
 *   │ ─────────────────────── │ Terminal  │
 *   │  Chat (composer)         │           │
 *   └─────────────────────────┴───────────┘
 */
export default function ChatWorkspace() {
  const workspacePath = useAxonizWorkspaceStore((s) => s.workspacePath);
  const setWorkspace = useAxonizWorkspaceStore((s) => s.setWorkspace);
  const setSessions = useAxonizWorkspaceStore((s) => s.setSessions);
  const pushTerminalLine = useAxonizWorkspaceStore((s) => s.pushTerminalLine);
  const terminalPanelOpen = useAxonizWorkspaceStore((s) => s.terminalPanelOpen);
  const terminalSize = useAxonizWorkspaceStore((s) => s.terminalSize);
  const editorSize = useAxonizWorkspaceStore((s) => s.editorSize);
  const setTerminalSize = useAxonizWorkspaceStore((s) => s.setTerminalSize);
  const setEditorSize = useAxonizWorkspaceStore((s) => s.setEditorSize);
  const openTabs = useAxonizWorkspaceStore((s) => s.openTabs);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await listWorkspace(undefined, 2);
        if (cancelled) return;
        setWorkspace(ws.root);
        const git = await getGitLog(ws.root, 20);
        if (cancelled) return;
        pushTerminalLine({ id: `boot-${Date.now()}`, kind: "info", text: `workspace · ${ws.root}`, ts: Date.now() });
        if (git.isGitRepo && git.status) {
          pushTerminalLine({
            id: `git-${Date.now()}`, kind: "info",
            text: `git · branch ${git.status.branch} @ ${git.status.head} · ${git.status.staged} staged · ${git.status.modified} modified · ${git.status.untracked} untracked`,
            ts: Date.now(),
          });
          for (const entry of git.log.slice(0, 5)) {
            pushTerminalLine({
              id: `log-${entry.hash.slice(0, 7)}`, kind: "stdout",
              text: `${entry.hash.slice(0, 7)}  ${entry.subject}`, ts: Date.now(),
            });
          }
        }
      } catch (e) {
        pushTerminalLine({
          id: `booterr-${Date.now()}`, kind: "error",
          text: `boot: ${(e as Error).message}`, ts: Date.now(),
        });
      }
      try {
        const sessions = await listSessions();
        if (cancelled) return;
        setSessions(sessions);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [pushTerminalLine, setSessions, setWorkspace]);

  const showEditor = openTabs.length > 0;
  const chatSize = Math.max(15, 100 - editorSize);
  // Auto-collapse terminal below lg breakpoint — too cramped on mobile
  const showTerminal = terminalPanelOpen;

  return (
    <>
      {/* Mobile + tablet: chat full-screen, editor as overlay modal */}
      <div className="lg:hidden flex-1 flex flex-col min-h-0">
        <ChatPanel />
      </div>

      {/* Mobile: editor as a full-screen modal overlay when a file is open */}
      {showEditor && (
        <div className="lg:hidden fixed inset-0 z-40 sheet-enter bg-background" style={{ top: "var(--safe-top)" }}>
          <FileEditorArea />
        </div>
      )}

      {/* Mobile: terminal as a slide-up sheet when toggled open */}
      {showTerminal && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 h-[50vh] sheet-enter" style={{ paddingBottom: "var(--safe-bottom)" }}>
          <TerminalPanel />
        </div>
      )}

      {/* Desktop (lg+): resizable horizontal split (terminal right) */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 min-h-0 hidden lg:flex"
        onLayout={(sizes) => {
          if (showTerminal && sizes.length === 2) {
            const total = sizes.reduce((a, b) => a + b, 0);
            const termPct = (sizes[1] / total) * 100;
            if (Math.abs(termPct - terminalSize) > 1) {
              setTerminalSize(Math.round(termPct));
            }
          }
        }}
      >
        <ResizablePanel
          defaultSize={showTerminal ? 100 - terminalSize : 100}
          minSize={40}
          className="min-w-0 min-h-0"
        >
        {showEditor ? (
          <ResizablePanelGroup
            direction="vertical"
            className="h-full"
            onLayout={(sizes) => {
              if (sizes.length === 2) {
                const total = sizes.reduce((a, b) => a + b, 0);
                const editorPct = (sizes[0] / total) * 100;
                if (Math.abs(editorPct - editorSize) > 1) {
                  setEditorSize(Math.round(editorPct));
                }
              }
            }}
          >
            <ResizablePanel
              defaultSize={editorSize}
              minSize={12}
              maxSize={85}
              className="min-h-0 min-w-0"
            >
              <FileEditorArea />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={chatSize}
              minSize={15}
              className="min-h-0 min-w-0"
            >
              <ChatPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ChatPanel />
        )}
      </ResizablePanel>

      {terminalPanelOpen && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={terminalSize}
            minSize={15}
            maxSize={50}
            className="min-w-0 min-h-0"
          >
            <TerminalPanel />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
    </>
  );
}
