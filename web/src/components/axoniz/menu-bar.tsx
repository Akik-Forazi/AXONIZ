"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare, Bot, Boxes, Anvil, Network, BrainCircuit,
  Search, Gauge, Activity, Settings, Sun, Moon, PanelLeftClose,
  RotateCcw, TerminalSquare, Target,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAxonizWorkspaceStore } from "@/stores/axoniz-workspace-store";
import { useAxonizStore } from "@/stores/axoniz-store";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: "terminal" | "model" | "activity";
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Chat", icon: MessageSquare },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/goal", label: "Goal", icon: Target },
];

const WORKSPACE_NAV: NavItem[] = [
  { href: "/vault", label: "Vault", icon: Boxes },
  { href: "/forge", label: "Forge", icon: Anvil },
  { href: "/war-room", label: "War Room", icon: Network },
  { href: "/palace", label: "Palace", icon: BrainCircuit },
  { href: "/axodex", label: "Axodex", icon: Search },
  { href: "/search", label: "Absolute Search", icon: Search },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/benchmarks", label: "Benchmarks", icon: Gauge },
  { href: "/system", label: "System", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * MenuBar — LEFT-side thin icon strip.
 *
 * Top:    Primary (Chat / Agent) + Workspace (Vault/Forge/War Room/Palace/Axodex/Search) + System (Benchmarks/System/Settings)
 * Plus:   Terminal toggle, Activity, Model picker
 * Bottom: Theme toggle, Reset layout, Hide self
 *
 * Icons use Next.js <Link> for client-side navigation. Active route gets
 * a vertical bar on its left edge.
 */
export function MenuBar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const pathname = usePathname();

  const toggleLeftPanel = useAxonizWorkspaceStore((s) => s.toggleLeftPanel);
  const terminalPanelOpen = useAxonizWorkspaceStore((s) => s.terminalPanelOpen);
  const setTerminalPanelOpen = useAxonizWorkspaceStore((s) => s.setTerminalPanelOpen);
  const resetLayout = useAxonizWorkspaceStore((s) => s.resetLayout);
  const toolCalls = useAxonizWorkspaceStore((s) => s.toolCalls);
  const isStreaming = useAxonizWorkspaceStore((s) => s.isStreaming);
  const openModelPicker = useAxonizWorkspaceStore((s) => s.openModelPicker);
  const openModelPickerAxoniz = useAxonizStore((s) => s.openModelPicker);
  const openPicker = openModelPicker || openModelPickerAxoniz;

  const activeToolCount = toolCalls.filter((t) => t.status === "running").length;
  const completedTools = toolCalls.filter((t) => t.status === "ok").length;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="w-12 sm:w-12 flex flex-col items-center py-2 pb-safe gap-1 glass-panel rounded-none border-t-0 border-l-0 border-b-0 flex-shrink-0 overflow-y-auto no-scrollbar">
      <TooltipProvider delayDuration={300}>
        {/* Primary */}
        {PRIMARY_NAV.map((item) => (
          <NavIcon key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />
        ))}

        <div className="w-6 h-px bg-border my-1.5" />

        {/* Workspace */}
        {WORKSPACE_NAV.map((item) => (
          <NavIcon key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />
        ))}

        <div className="w-6 h-px bg-border my-1.5" />

        {/* System */}
        {SYSTEM_NAV.map((item) => (
          <NavIcon key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />
        ))}

        <div className="w-6 h-px bg-border my-1.5" />

        {/* Terminal toggle — only relevant on chat route */}
        <MenuIcon
          label={terminalPanelOpen ? "Hide terminal" : "Show terminal"}
          onClick={() => setTerminalPanelOpen(!terminalPanelOpen)}
          active={terminalPanelOpen}
        >
          <TerminalSquare className="w-4 h-4" />
        </MenuIcon>

        {/* Activity — shows tool call count */}
        <MenuIcon
          label={isStreaming ? `Agent running · ${activeToolCount} active` : `Activity · ${completedTools} completed`}
          onClick={openPicker}
          active={isStreaming}
        >
          <div className="relative">
            <Activity className={cn("w-4 h-4", isStreaming && "text-accent")} />
            {activeToolCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent glow-accent" />
            )}
          </div>
        </MenuIcon>

        {/* Model picker */}
        <MenuIcon label="Select model" onClick={openPicker}>
          <div className="w-4 h-4 rounded-full border-[1.5px] border-current flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-current" />
          </div>
        </MenuIcon>

        <div className="flex-1" />

        {/* Bottom */}
        <MenuIcon
          label={isDark ? "Switch to light" : "Switch to dark"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </MenuIcon>
        <MenuIcon label="Reset layout" onClick={resetLayout}>
          <RotateCcw className="w-4 h-4" />
        </MenuIcon>
        <MenuIcon label="Hide menu bar" onClick={toggleLeftPanel}>
          <PanelLeftClose className="w-4 h-4" />
        </MenuIcon>
      </TooltipProvider>
    </aside>
  );
}

function NavIcon({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-label={item.label}
          onClick={onNavigate}
          className={cn(
            "w-9 h-9 rounded-lg press relative flex items-center justify-center transition-colors",
            active
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
          )}
        >
          <Icon className="w-4 h-4" />
          {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[1px] w-0.5 h-4 rounded-full bg-primary" />
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-[11px]">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function MenuIcon({
  label, onClick, active, children,
}: {
  label: string; onClick?: () => void; active?: boolean; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "w-9 h-9 rounded-lg press relative",
            active ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
          )}
        >
          {children}
          {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[1px] w-0.5 h-4 rounded-full bg-primary" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-[11px]">{label}</TooltipContent>
    </Tooltip>
  );
}
