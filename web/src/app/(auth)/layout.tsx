"use client";

import { useAxonizStore } from "@/stores/axoniz-store";
import { TopBar } from "@/components/axoniz/top-bar";
import { Sidebar } from "@/components/axoniz/sidebar";
import { EventStreamProvider } from "@/components/axoniz/event-stream-provider";
import { SchedulerProvider } from "@/components/axoniz/scheduler-provider";
import { ChatStreamProvider } from "@/components/axoniz/chat-stream-provider";
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
 *
 * The EventRail side panel used to be mounted here — that caused two
 * problems: (1) it ate ~288px on every page even when the user didn't
 * care about the event stream, and (2) the EventSource it opened was
 * tied to the layout, but per-page React state was lost on navigation.
 * The EventStream now lives on a dedicated /event-stream page, and the
 * singleton EventSource is owned by <EventStreamProvider /> (renders
 * null — it just feeds events into the store so any page can read them).
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
      </div>
      <footer className="mt-auto border-t border-border bg-background py-2 px-4 flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>© 2026 Akik Faraji — Fraziym Tech &amp; AI</span>
        <span className="hidden sm:inline font-mono">AXONIZ v0.3.2</span>
      </footer>
      {modelPickerOpen && <ModelPicker />}
      {/* Singleton — owns the global EventSource for the event stream.
          Renders null. Mounted at the layout level so it survives every
          page navigation; events accumulate in the store and are visible
          on the /event-stream page. */}
      <EventStreamProvider />
      {/* Singleton — owns one EventSource per active chat execution.
          Renders null. Mounted at the layout level so chat streaming
          survives navigation: when the user clicks away from
          /chat/s/<id>, the EventSource stays open and tokens keep
          flowing into the store. When they return, the messages are
          already there — no reload, no lost progress. */}
      <ChatStreamProvider />
      <SchedulerProvider />
    </div>
  );
}
