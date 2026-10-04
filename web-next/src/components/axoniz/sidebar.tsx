"use client";

import { useEffect } from "react";
import {
  MessageSquare, Bot, Boxes, Anvil, Network, BrainCircuit,
  GitBranch, Search, Gauge, Activity, Settings as SettingsIcon,
  ChevronRight, type LucideIcon,
} from "lucide-react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
}

const PRIMARY_NAV: NavItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, route: "/chat" },
  { id: "agent", label: "Agent", icon: Bot, route: "/agent" },
];

const WORKSPACE_NAV: NavItem[] = [
  { id: "vault", label: "Vault", icon: Boxes, route: "/vault" },
  { id: "forge", label: "Forge", icon: Anvil, route: "/forge" },
  { id: "war-room", label: "War Room", icon: Network, route: "/war-room" },
  { id: "palace", label: "Palace", icon: BrainCircuit, route: "/palace" },
  { id: "axodex", label: "Axodex", icon: GitBranch, route: "/axodex" },
  { id: "search", label: "Search", icon: Search, route: "/search" },
];

const SYSTEM_NAV: NavItem[] = [
  { id: "benchmarks", label: "Benchmarks", icon: Gauge, route: "/benchmarks" },
  { id: "system", label: "System", icon: Activity, route: "/system" },
  { id: "settings", label: "Settings", icon: SettingsIcon, route: "/settings" },
];

export function Sidebar() {
  const { route, navigate, sidebarCollapsed } = useAxonizStore();

  // Auto-collapse on smaller viewports.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => {
      if (mq.matches && !useAxonizStore.getState().sidebarCollapsed) {
        useAxonizStore.setState({ sidebarCollapsed: true });
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const isActive = (r: string) =>
    route === r || (r !== "/chat" && route.startsWith(r));

  const renderItem = (item: NavItem, active: boolean) => (
    <TooltipProvider key={item.id} delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => navigate(item.route)}
            className={`group relative flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors w-full
              ${active
                ? "bg-foreground/5 text-foreground border border-foreground/15"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"}`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="font-medium truncate">{item.label}</span>}
          </button>
        </TooltipTrigger>
        {sidebarCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );

  // If on a settings sub-page, show expanded settings nav
  const inSettings = route.startsWith("/settings");
  const settingsSubNav: NavItem[] = [
    { id: "providers", label: "Providers", icon: Network, route: "/settings/providers" },
    { id: "runtime", label: "Runtime", icon: Activity, route: "/settings/runtime" },
    { id: "authority", label: "Authority", icon: SettingsIcon, route: "/settings/authority" },
    { id: "voice", label: "Voice", icon: MessageSquare, route: "/settings/voice" },
    { id: "appearance", label: "Appearance", icon: SettingsIcon, route: "/settings/appearance" },
    { id: "session", label: "Session", icon: SettingsIcon, route: "/settings/session" },
  ];

  return (
    <aside
      className="sticky top-12 self-start shrink-0 h-[calc(100vh-3rem)] border-r border-border bg-sidebar overflow-hidden transition-[width] duration-200"
      style={{ width: sidebarCollapsed ? 56 : 224 }}
    >
      <nav className="flex flex-col gap-3 p-2 h-full">
        <div className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => renderItem(item, isActive(item.route)))}
        </div>

        {!sidebarCollapsed && (
          <div className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-1">
            Workspace
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {WORKSPACE_NAV.map((item) => renderItem(item, isActive(item.route)))}
        </div>

        {!sidebarCollapsed && (
          <div className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-1">
            System
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {SYSTEM_NAV.map((item) => renderItem(item, isActive(item.route)))}
        </div>

        {/* Settings sub-nav (expanded when in /settings) */}
        {inSettings && !sidebarCollapsed && (
          <div className="mt-1 border-t border-border pt-2">
            <div className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">
              Settings
            </div>
            <div className="flex flex-col gap-0.5">
              {settingsSubNav.map((item) => {
                const active = isActive(item.route) || route === item.route;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.route)}
                    className={`flex items-center gap-2 pl-5 pr-2.5 h-7 rounded-md text-[12px] transition-colors ${
                      active
                        ? "bg-foreground/5 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto pt-2 border-t border-border">
          <div className="px-2.5 py-1 text-[10px] text-muted-foreground/50 font-mono">
            {!sidebarCollapsed ? "v0.3.0" : ""}
          </div>
        </div>
      </nav>
    </aside>
  );
}
