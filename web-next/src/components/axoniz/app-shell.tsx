"use client";

import { useEffect, useRef } from "react";
import {
  MessageSquare,
  Boxes,
  Anvil,
  Network,
  BrainCircuit,
  Search,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Power,
  type LucideIcon,
} from "lucide-react";
import { useAxonizStore, type SectionId } from "@/stores/axoniz-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConsoleSection } from "./sections/console";
import { VaultSection } from "./sections/vault";
import { ForgeSection } from "./sections/forge";
import { WarRoomSection } from "./sections/war-room";
import { PalaceSection } from "./sections/palace";
import { AbsoluteSearchSection } from "./sections/absolute-search";
import { SystemSection } from "./sections/system";
import { SettingsSection } from "./sections/settings";
import { EventRail } from "./event-rail";
import { useHealthQuery, useSystemStatsQuery } from "./queries";

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "console", label: "Console", icon: MessageSquare },
  { id: "vault", label: "Vault", icon: Boxes },
  { id: "forge", label: "Forge", icon: Anvil },
  { id: "war-room", label: "War Room", icon: Network },
  { id: "palace", label: "Palace", icon: BrainCircuit },
  { id: "search", label: "Search", icon: Search },
  { id: "system", label: "System", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const {
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    toggleSidebar,
    username,
    activeModel,
    logout,
  } = useAxonizStore();

  const { data: health } = useHealthQuery();
  const { data: sysStats } = useSystemStatsQuery();

  // Auto-collapse the sidebar on smaller viewports.
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

  const online = health?.status === "active";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar — solid, hairline bottom border */}
      <header className="sticky top-0 z-30 flex items-center gap-2 px-4 h-12 border-b border-border bg-background/95 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>

        {/* Wordmark */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <span className="text-primary font-mono text-[10px] font-semibold tracking-tighter">AX</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">AXONIZ</span>
        </div>

        {/* Active section label */}
        <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
          / {activeSection.replace("-", " ")}
        </span>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Active model */}
          {activeModel && (
            <Badge
              variant="outline"
              className="hidden sm:inline-flex border-border bg-secondary text-secondary-foreground text-[11px] font-mono gap-1.5 px-2 h-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              {activeModel.length > 26 ? activeModel.slice(0, 26) + "…" : activeModel}
            </Badge>
          )}

          {/* Connection status */}
          <ConnectionPill online={online} />

          {/* CPU */}
          {sysStats?.cpu && (
            <Badge
              variant="outline"
              className="hidden lg:inline-flex border-border bg-secondary text-secondary-foreground text-[11px] font-mono px-2 h-6"
            >
              CPU {Math.round(sysStats.cpu.usage * 100)}%
            </Badge>
          )}

          {/* User menu */}
          <div className="flex items-center gap-2 pl-2 ml-1 border-l border-border">
            <span className="hidden sm:inline text-xs text-muted-foreground">{username}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              title="Sign out"
            >
              <Power className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside
          className="sticky top-12 self-start shrink-0 h-[calc(100vh-3rem)] border-r border-border bg-sidebar overflow-hidden transition-[width] duration-200"
          style={{ width: sidebarCollapsed ? 56 : 208 }}
        >
          <nav className="flex flex-col gap-0.5 p-2 h-full">
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              const Icon = item.icon;
              return (
                <TooltipProvider key={item.id} delayDuration={400}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={`group relative flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors
                          ${active
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"}`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {!sidebarCollapsed && (
                          <span className="font-medium">{item.label}</span>
                        )}
                      </button>
                    </TooltipTrigger>
                    {sidebarCollapsed && (
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })}
            <div className="mt-auto pt-2 border-t border-border">
              <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground/60 font-mono">
                {!sidebarCollapsed ? "v0.2.1" : ""}
              </div>
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 min-h-[calc(100vh-3rem)] overflow-hidden bg-background">
          <div key={activeSection} className="h-full animate-fade-in">
            {activeSection === "console" && <ConsoleSection />}
            {activeSection === "vault" && <VaultSection />}
            {activeSection === "forge" && <ForgeSection />}
            {activeSection === "war-room" && <WarRoomSection />}
            {activeSection === "palace" && <PalaceSection />}
            {activeSection === "search" && <AbsoluteSearchSection />}
            {activeSection === "system" && <SystemSection />}
            {activeSection === "settings" && <SettingsSection />}
          </div>
        </main>

        {/* Right rail */}
        <EventRail />
      </div>

      {/* Footer — sticky, minimal */}
      <footer className="mt-auto border-t border-border bg-background py-2 px-4 flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>© 2026 Akik Faraji — Fraziym Tech &amp; AI</span>
        <span className="hidden sm:inline font-mono">
          {health?.backend ?? "—"}
        </span>
      </footer>
    </div>
  );
}

function ConnectionPill({ online }: { online: boolean }) {
  const source = useAxonizStore((s) => s.dataSource);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1.5 px-2 h-6 rounded-md text-[11px] font-mono border ${
              online
                ? "border-accent/20 bg-accent/5 text-accent"
                : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${online ? "bg-accent animate-blink" : "bg-muted-foreground"}`}
            />
            <span className="hidden sm:inline">{online ? "ONLINE" : "OFFLINE"}</span>
            <span
              className={`ml-1 px-1 py-0.5 rounded text-[9px] uppercase ${
                source === "live"
                  ? "bg-accent/15 text-accent"
                  : source === "mock"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {source === "unknown" ? "?" : source}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {online ? "Agent online" : "Agent not initialized"}
          <br />
          Data: {source === "live" ? "live backend" : source === "mock" ? "mock (no backend)" : "unknown"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
