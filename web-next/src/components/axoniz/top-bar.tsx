"use client";

import { ChevronLeft, ChevronRight, Power, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHealthQuery, useSystemStatsQuery } from "./queries";

export function TopBar() {
  const pathname = usePathname();
  const {
    sidebarCollapsed,
    toggleSidebar,
    activeProvider,
    activeModel,
    username,
    logout,
    openModelPicker,
  } = useAxonizStore();
  const { data: health } = useHealthQuery();
  const { data: sysStats } = useSystemStatsQuery();
  const dataSource = useAxonizStore((s) => s.dataSource);

  const online = health?.status === "active";
  const providerMeta = PROVIDER_CATALOG.find((p) => p.id === activeProvider);

  // Build breadcrumb from real Next.js pathname
  const parts = pathname.split("/").filter(Boolean);
  const breadcrumb = parts.length > 0
    ? parts.map((p) => p.length > 22 ? p.slice(0, 22) + "…" : p).join(" / ")
    : "chat";

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 px-4 h-12 border-b border-border bg-background/95 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </Button>

      {/* Wordmark */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-foreground/8 border border-foreground/15 flex items-center justify-center">
          <span className="text-foreground font-mono text-[10px] font-semibold tracking-tighter">AX</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">AXONIZ</span>
      </div>

      <span className="ml-2 text-xs text-muted-foreground hidden sm:inline font-mono">
        / {breadcrumb}
      </span>

      {/* Right */}
      <div className="ml-auto flex items-center gap-2">
        {/* Model picker trigger */}
        <button
          onClick={openModelPicker}
          className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md border border-border bg-secondary text-secondary-foreground text-[11px] hover:border-foreground/20 transition-colors"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-accent" : "bg-muted-foreground"}`} />
          <span className="text-muted-foreground">{providerMeta?.name ?? activeProvider}</span>
          {activeModel && (
            <span className="font-mono text-foreground/80 max-w-[200px] truncate">
              {activeModel.length > 22 ? activeModel.slice(0, 22) + "…" : activeModel}
            </span>
          )}
          <Search className="w-3 h-3 text-muted-foreground" />
        </button>

        {/* Source pill */}
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
                <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-accent animate-blink" : "bg-muted-foreground"}`} />
                <span className="hidden sm:inline">{online ? "ONLINE" : "OFFLINE"}</span>
                <span className={`ml-1 px-1 py-0.5 rounded text-[9px] uppercase ${
                  dataSource === "live" ? "bg-accent/15 text-accent"
                  : dataSource === "mock" ? "bg-foreground/10 text-foreground"
                  : "bg-secondary text-muted-foreground"
                }`}>
                  {dataSource === "unknown" ? "?" : dataSource}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>Backend: {health?.backend ?? "—"} · source: {dataSource}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* CPU */}
        {sysStats?.cpu && (
          <Badge variant="outline" className="hidden lg:inline-flex border-border bg-secondary text-secondary-foreground text-[11px] font-mono px-2 h-6">
            CPU {Math.round(sysStats.cpu.usage * 100)}%
          </Badge>
        )}

        {/* User */}
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
  );
}
