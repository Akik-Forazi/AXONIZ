"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare, Bot, Boxes, Anvil, Network, BrainCircuit,
  GitBranch, Search, Gauge, Activity, Settings as SettingsIcon,
  ChevronRight, type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAxonizStore } from "@/stores/axoniz-store";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

const PRIMARY_NAV: NavItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, href: "/chat" },
  { id: "agent", label: "Agent", icon: Bot, href: "/agent" },
];

const WORKSPACE_NAV: NavItem[] = [
  { id: "vault", label: "Vault", icon: Boxes, href: "/vault" },
  { id: "forge", label: "Forge", icon: Anvil, href: "/forge" },
  { id: "war-room", label: "War Room", icon: Network, href: "/war-room" },
  { id: "palace", label: "Palace", icon: BrainCircuit, href: "/palace" },
  { id: "axodex", label: "Axodex", icon: GitBranch, href: "/axodex" },
  { id: "search", label: "Search", icon: Search, href: "/search" },
];

const SYSTEM_NAV: NavItem[] = [
  { id: "benchmarks", label: "Benchmarks", icon: Gauge, href: "/benchmarks" },
  { id: "system", label: "System", icon: Activity, href: "/system" },
  { id: "settings", label: "Settings", icon: SettingsIcon, href: "/settings" },
];

const SETTINGS_SUB_NAV: NavItem[] = [
  { id: "providers", label: "Providers", icon: Network, href: "/settings/providers" },
  { id: "runtime", label: "Runtime", icon: Activity, href: "/settings/runtime" },
  { id: "authority", label: "Authority", icon: SettingsIcon, href: "/settings/authority" },
  { id: "voice", label: "Voice", icon: MessageSquare, href: "/settings/voice" },
  { id: "appearance", label: "Appearance", icon: SettingsIcon, href: "/settings/appearance" },
  { id: "session", label: "Session", icon: SettingsIcon, href: "/settings/session" },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useAxonizStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAxonizStore((s) => s.setSidebarCollapsed);

  // Auto-collapse on smaller viewports.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => {
      if (mq.matches) setSidebarCollapsed(true);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [setSidebarCollapsed]);

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/chat" && pathname.startsWith(href));

  const inSettings = pathname.startsWith("/settings");

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <TooltipProvider key={item.id} delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={`group relative flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors w-full
                ${active
                  ? "bg-foreground/5 text-foreground border border-foreground/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"}`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="font-medium truncate">{item.label}</span>}
            </Link>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
    );
  };

  const width = collapsed ? 56 : 224;

  return (
    <aside
      className="sticky top-12 self-start shrink-0 h-[calc(100vh-3rem)] border-r border-border bg-sidebar overflow-hidden transition-[width] duration-200"
      style={{ width }}
    >
      <nav className="flex flex-col gap-3 p-2 h-full">
        <div className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map(renderItem)}
        </div>

        {!collapsed && (
          <div className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-1">
            Workspace
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {WORKSPACE_NAV.map(renderItem)}
        </div>

        {!collapsed && (
          <div className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-1">
            System
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {SYSTEM_NAV.map(renderItem)}
        </div>

        {/* Settings sub-nav (expanded when in /settings) */}
        {inSettings && !collapsed && (
          <div className="mt-1 border-t border-border pt-2">
            <div className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">
              Settings
            </div>
            <div className="flex flex-col gap-0.5">
              {SETTINGS_SUB_NAV.map((item) => {
                const active = isActive(item.href) || pathname === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-center gap-2 pl-5 pr-2.5 h-7 rounded-md text-[12px] transition-colors ${
                      active
                        ? "bg-foreground/5 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto pt-2 border-t border-border">
          <div className="px-2.5 py-1 text-[10px] text-muted-foreground/50 font-mono">
            {!collapsed ? "v0.3.1" : ""}
          </div>
        </div>
      </nav>
    </aside>
  );
}
