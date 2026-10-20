"use client";

import { useEffect, useState } from "react";
import { TopBar } from "./top-bar";
import { MenuBar } from "./menu-bar";
import { ModelSelector } from "./model-selector";
import { useAxonizStore } from "@/stores/axoniz-store";
import { useAxonizWorkspaceStore } from "@/stores/axoniz-workspace-store";
// (kept for future use — currently the layout state is in axoniz-workspace-store)
import { Menu as MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * WorkspaceShell — shared layout wrapper for every AXONIZ route.
 *
 * Desktop (lg+): TopBar at top, MenuBar docked left (48px), main content fills rest.
 * Tablet (md): same as desktop.
 * Mobile (<md): TopBar with hamburger button, MenuBar slides in as overlay drawer
 *   when toggled. Main content gets full width.
 *
 * Safe-area-aware: respects iPhone notch + iPad home-indicator via env() insets.
 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const modelPickerOpen = useAxonizStore((s) => s.modelPickerOpen);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change (viewport resize to desktop, etc.)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => { if (mq.matches) setDrawerOpen(false); };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div
      className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden relative"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <TopBar onHamburgerClick={() => setDrawerOpen(true)} />

      <div className="flex-1 flex min-h-0">
        {/* Desktop: docked menu bar */}
        <div className="hidden md:flex">
          <MenuBar />
        </div>

        {/* Mobile: drawer overlay */}
        {drawerOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 z-40 bg-background/60 backdrop-blur-sm backdrop-enter"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="md:hidden fixed left-0 top-12 bottom-0 z-50 drawer-enter pt-safe">
              <MenuBar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">{children}</main>
      </div>

      {modelPickerOpen && <ModelSelector />}

      {/* Mobile hamburger FAB when drawer closed */}
      {!drawerOpen && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDrawerOpen(true)}
          className="md:hidden fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full glass-elevated press shadow-lg"
          aria-label="Open menu"
        >
          <MenuIcon className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
