"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAxonizStore } from "@/stores/axoniz-store";
import { LoginScreen } from "@/components/axoniz/login-screen";
import { TopBar } from "@/components/axoniz/top-bar";
import { Sidebar } from "@/components/axoniz/sidebar";
import { EventRail } from "@/components/axoniz/event-rail";
import { ModelPicker } from "@/components/axoniz/model-picker";
import { useAxonizBoot } from "@/components/axoniz/boot";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = useAxonizStore((s) => s.token);
  const modelPickerOpen = useAxonizStore((s) => s.modelPickerOpen);
  const router = useRouter();
  useAxonizBoot();

  // If not authenticated, render the login screen and let it handle the
  // redirect to /chat itself after a successful login.
  if (!token) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-[calc(100vh-3rem)] overflow-hidden bg-background">
          <div key={typeof window !== "undefined" ? window.location.pathname : "ssr"} className="h-full animate-fade-in">
            {children}
          </div>
        </main>
        <EventRail />
      </div>
      <footer className="mt-auto border-t border-border bg-background py-2 px-4 flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>© 2026 Akik Faraji — Fraziym Tech &amp; AI</span>
        <span className="hidden sm:inline font-mono">AXONIZ v0.3.1</span>
      </footer>
      {modelPickerOpen && <ModelPicker />}
    </div>
  );
}
