"use client";

import { useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { LoginScreen } from "@/components/axoniz/login-screen";
import { TopBar } from "@/components/axoniz/top-bar";
import { Sidebar } from "@/components/axoniz/sidebar";
import { EventRail } from "@/components/axoniz/event-rail";
import { ModelPicker } from "@/components/axoniz/model-picker";
import { ChatPage } from "@/components/axoniz/pages/chat";
import { AgentPage } from "@/components/axoniz/pages/agent";
import { VaultPage } from "@/components/axoniz/pages/vault";
import { ForgePage } from "@/components/axoniz/pages/forge";
import { WarRoomPage } from "@/components/axoniz/pages/war-room";
import { PalacePage } from "@/components/axoniz/pages/palace";
import { AxodexPage } from "@/components/axoniz/pages/axodex";
import { AbsoluteSearchPage } from "@/components/axoniz/pages/search";
import { BenchmarksPage } from "@/components/axoniz/pages/benchmarks";
import { SystemPage } from "@/components/axoniz/pages/system";
import { SettingsIndexPage } from "@/components/axoniz/pages/settings/index";
import { ProvidersListPage } from "@/components/axoniz/pages/settings/providers";
import { ProviderDetailPage } from "@/components/axoniz/pages/settings/provider-detail";
import { RuntimeSettingsPage } from "@/components/axoniz/pages/settings/runtime";
import { AuthoritySettingsPage } from "@/components/axoniz/pages/settings/authority";
import { VoiceSettingsPage } from "@/components/axoniz/pages/settings/voice";
import { AppearanceSettingsPage } from "@/components/axoniz/pages/settings/appearance";
import { SessionSettingsPage } from "@/components/axoniz/pages/settings/session";
import { useAxonizBoot } from "@/components/axoniz/boot";

function parseRoute(route: string): { page: string; sub?: string; id?: string } {
  const parts = route.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "chat" };
  const page = parts[0];
  if (page === "settings" && parts.length >= 3 && parts[1] === "providers") {
    return { page: "settings", sub: "providers", id: parts[2] };
  }
  if (page === "settings" && parts.length === 2) {
    return { page: "settings", sub: parts[1] };
  }
  if (page === "settings") {
    return { page: "settings" };
  }
  return { page };
}

function renderPage(parsed: ReturnType<typeof parseRoute>) {
  switch (parsed.page) {
    case "chat": return <ChatPage />;
    case "agent": return <AgentPage />;
    case "vault": return <VaultPage />;
    case "forge": return <ForgePage />;
    case "war-room": return <WarRoomPage />;
    case "palace": return <PalacePage />;
    case "axodex": return <AxodexPage />;
    case "search": return <AbsoluteSearchPage />;
    case "benchmarks": return <BenchmarksPage />;
    case "system": return <SystemPage />;
    case "settings":
      if (parsed.sub === "providers" && parsed.id) {
        return <ProviderDetailPage providerId={parsed.id} />;
      }
      if (parsed.sub === "providers") return <ProvidersListPage />;
      if (parsed.sub === "runtime") return <RuntimeSettingsPage />;
      if (parsed.sub === "authority") return <AuthoritySettingsPage />;
      if (parsed.sub === "voice") return <VoiceSettingsPage />;
      if (parsed.sub === "appearance") return <AppearanceSettingsPage />;
      if (parsed.sub === "session") return <SessionSettingsPage />;
      return <SettingsIndexPage />;
    default: return <ChatPage />;
  }
}

export function AppRouter() {
  useAxonizBoot();
  const token = useAxonizStore((s) => s.token);
  const route = useAxonizStore((s) => s.route);
  const navigate = useAxonizStore((s) => s.navigate);
  const modelPickerOpen = useAxonizStore((s) => s.modelPickerOpen);

  // Keep URL hash in sync with route (so users can deep-link / bookmark / share)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const newHash = `#${route}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
  }, [route]);

  // On first load, read hash → route
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && hash.startsWith("/")) navigate(hash);
  }, [navigate]);

  if (!token) return <LoginScreen />;

  const parsed = parseRoute(route);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-[calc(100vh-3rem)] overflow-hidden bg-background">
          <div key={route} className="h-full animate-fade-in">
            {renderPage(parsed)}
          </div>
        </main>
        <EventRail />
      </div>
      <footer className="mt-auto border-t border-border bg-background py-2 px-4 flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>© 2026 Akik Faraji — Fraziym Tech &amp; AI</span>
        <span className="hidden sm:inline font-mono">AXONIZ v0.3.0</span>
      </footer>
      {modelPickerOpen && <ModelPicker />}
    </div>
  );
}
