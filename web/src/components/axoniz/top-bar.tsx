"use client";

import { useTheme } from "next-themes";
import { PanelLeft, PanelRight, Sun, Moon, Menu as MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";
import { useAxonizWorkspaceStore } from "@/stores/axoniz-workspace-store";
import { cn } from "@/lib/utils";

export function TopBar({ onHamburgerClick }: { onHamburgerClick?: () => void } = {}) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const toggleLeftPanel = useAxonizWorkspaceStore((s) => s.toggleLeftPanel);
  const leftPanelOpen = useAxonizWorkspaceStore((s) => s.leftPanelOpen);
  const toggleTerminalPanel = useAxonizWorkspaceStore((s) => s.toggleTerminalPanel);
  const terminalPanelOpen = useAxonizWorkspaceStore((s) => s.terminalPanelOpen);
  const workspacePath = useAxonizWorkspaceStore((s) => s.workspacePath);
  const openModelPicker = useAxonizStore((s) => s.openModelPicker);
  const activeProvider = useAxonizStore((s) => s.activeProvider);
  const activeModel = useAxonizStore((s) => s.activeModel);

  const providerMeta = PROVIDER_CATALOG.find((p) => p.id === activeProvider);

  return (
    <header
      className="flex items-center gap-1 sm:gap-2 h-12 px-2 sm:px-3 glass-panel rounded-none flex-shrink-0 relative z-30 border-t-0 border-x-0 pl-safe pr-safe"
    >
      <TooltipProvider>
        {/* Mobile hamburger (md and below) — opens drawer */}
        {onHamburgerClick && (
          <IconButton
            label="Open menu"
            onClick={onHamburgerClick}
            className="md:hidden"
          >
            <MenuIcon className="w-4 h-4" />
          </IconButton>
        )}

        {/* Desktop: left panel toggle (md and up) */}
        <IconButton
          label={leftPanelOpen ? "Hide menu bar" : "Show menu bar"}
          onClick={toggleLeftPanel}
          active={leftPanelOpen}
          className="hidden md:inline-flex"
        >
          <PanelLeft className="w-4 h-4" />
        </IconButton>
      </TooltipProvider>

      {/* Wordmark — compact on mobile */}
      <div className="flex items-center gap-2 sm:gap-2.5 ml-0.5 sm:ml-1 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center press shadow-lg shadow-primary/20">
          <span className="font-mono text-[10px] font-bold tracking-tighter">AX</span>
        </div>
        <div className="flex flex-col leading-none hidden sm:flex">
          <span className="text-[13px] font-semibold tracking-tight text-gradient">AXONIZ</span>
          <span className="text-[9px] text-muted-foreground font-mono tracking-wider uppercase mt-0.5">Chat</span>
        </div>
      </div>

      {/* Breadcrumb — hidden on mobile */}
      <div className="hidden lg:flex items-center gap-2 ml-3 text-xs text-muted-foreground font-mono truncate">
        <span className="text-foreground/30">/</span>
        <span className="truncate" title={workspacePath ?? ""}>
          {workspacePath ? workspacePath.split("/").slice(-2).join("/") : "loading…"}
        </span>
      </div>

      <div className="flex-1" />

      {/* Model selector trigger — compact pill on mobile */}
      <button
        onClick={openModelPicker}
        className="group flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 h-8 rounded-lg glass-elevated glass-hover press text-xs relative min-w-0"
        aria-label="Change model"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot glow-accent flex-shrink-0" />
        <span className="text-muted-foreground hidden sm:inline truncate">{providerMeta?.name ?? "Provider"}</span>
        <span className="text-foreground font-medium font-mono truncate">{activeModel ?? "—"}</span>
        <svg className="w-3 h-3 text-muted-foreground group-hover:opacity-100 opacity-50 transition-opacity flex-shrink-0"
          viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Theme toggle — always visible */}
      <Button variant="ghost" size="icon" className="h-8 w-8 press flex-shrink-0"
        onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="Toggle theme">
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>

      {/* Terminal toggle — hidden on mobile (use the menu bar drawer instead) */}
      <IconButton
        label={terminalPanelOpen ? "Hide terminal" : "Show terminal"}
        onClick={toggleTerminalPanel}
        active={terminalPanelOpen}
        className="hidden lg:inline-flex"
      >
        <PanelRight className="w-4 h-4" />
      </IconButton>
    </header>
  );
}

function IconButton({
  label, onClick, active, children, className,
}: {
  label: string; onClick: () => void; active?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onClick}
            className={cn(
              "h-8 w-8 press transition-colors flex-shrink-0",
              active ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              className,
            )}
            aria-label={label}>
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
