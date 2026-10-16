"use client";

import { useAxonizStore } from "@/stores/axoniz-store";
import { TopBar } from "@/components/axoniz/top-bar";
import { Sidebar } from "@/components/axoniz/sidebar";
import { EventRail } from "@/components/axoniz/event-rail";
import { ModelPicker } from "@/components/axoniz/model-picker";
import { useAxonizBoot } from "@/components/axoniz/boot";

/**
 * Dashboard layout — LOCAL-FIRST, no login required.
 *
 * AXONIZ is a local system. No login screen, no token check.
 * The dashboard is directly accessible when you run `axoniz --web`.
 *
 * If you want auth (for network exposure), set AXONIZ_REQUIRE_AUTH=true
 * in .env and the API routes will require Bearer JWT tokens.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const modelPickerOpen = useAxonizStore((s) => s.modelPickerOpen);
  useAxonizBoot();

  // No login check — local-first, always show the dashboard
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-[calc(100vh-3rem)] overflow-hidden bg-background">
          <div className="h-full animate-fade-in">{children}</div>
        </main>
        <EventRail />
      </div>
      <footer className="mt-auto border-t border-border bg-background py-2 px-4 flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>© 2026 Akik Faraji — Fraziym Tech &amp; AI</span>
        <span className="hidden sm:inline font-mono">AXONIZ v0.3.2</span>
      </footer>
      {modelPickerOpen && <ModelPicker />}
    </div>
  );
}
