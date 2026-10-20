"use client";

import { X, FileText, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { useAxonizWorkspaceStore } from "@/stores/axoniz-workspace-store";
import { cn } from "@/lib/utils";

/**
 * File editor area. Always docks TOP of the chat in the center column.
 * Visible only when there are open tabs.
 */
export function FileEditorArea() {
  const openTabs = useAxonizWorkspaceStore((s) => s.openTabs);
  const activeTabPath = useAxonizWorkspaceStore((s) => s.activeTabPath);
  const setActiveTab = useAxonizWorkspaceStore((s) => s.setActiveTab);
  const closeFile = useAxonizWorkspaceStore((s) => s.closeFile);
  const closeAllFiles = useAxonizWorkspaceStore((s) => s.closeAllFiles);
  const { theme } = useTheme();

  if (openTabs.length === 0) return null;
  const active = openTabs.find((t) => t.path === activeTabPath) ?? openTabs[0];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab strip — inset bar with active indicator */}
      <div className="flex items-stretch glass-inset border-t-0 border-x-0 overflow-x-auto flex-shrink-0">
        {openTabs.map((tab) => {
          const Icon = tab.language && ["typescript","tsx","javascript","jsx","python","rust","go"].includes(tab.language) ? FileCode : FileText;
          const isActive = tab.path === active?.path;
          return (
            <div
              key={tab.path}
              className={cn(
                "flex items-center gap-1.5 px-3 h-9 text-[12px] font-mono cursor-pointer transition-all group flex-shrink-0 relative",
                isActive ? "text-foreground bg-background" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
              )}
              onClick={() => setActiveTab(tab.path)}
            >
              {isActive && <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-primary" />}
              <Icon className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[180px]">{tab.path.split("/").pop()}</span>
              <Button variant="ghost" size="icon"
                className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 hover:bg-secondary press"
                onClick={(e) => { e.stopPropagation(); closeFile(tab.path); }}
                aria-label={`Close ${tab.path}`}>
                <X className="w-2.5 h-2.5" />
              </Button>
            </div>
          );
        })}
        <div className="ml-auto flex items-center pr-1.5 flex-shrink-0">
          <Button variant="ghost" size="icon"
            className="h-7 w-7 press" onClick={closeAllFiles}
            aria-label="Close all tabs" title="Close all tabs">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* File path bar */}
      <div className="flex items-center px-3 h-6 text-[10px] text-muted-foreground font-mono flex-shrink-0 border-b border-border">
        <span className="truncate">{active?.path}</span>
        {active?.readOnly && (
          <span className="ml-2 px-1.5 py-0 rounded glass-inset text-foreground/60 uppercase tracking-widest text-[9px]">read only</span>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0 min-w-0">
        {active && active.content && !active.binary ? (
          <SyntaxHighlighter
            language={active.language ?? "text"}
            style={theme === "dark" ? oneDark : oneLight}
            customStyle={{
              margin: 0, background: "transparent",
              fontSize: "11.5px", padding: "0.75rem 1rem", lineHeight: 1.55,
            }}
            showLineNumbers
            lineNumberStyle={{
              color: theme === "dark" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
              paddingRight: "1rem", userSelect: "none", minWidth: "2.5em",
            }}
            wrapLongLines={false}
          >
            {active.content}
          </SyntaxHighlighter>
        ) : active?.binary ? (
          <div className="p-4 text-[12px] text-muted-foreground font-mono">{active.content}</div>
        ) : (
          <div className="p-4 text-[12px] text-muted-foreground">Empty file.</div>
        )}
      </ScrollArea>
    </div>
  );
}
