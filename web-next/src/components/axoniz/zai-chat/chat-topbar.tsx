"use client";
/**
 * Chat top bar — sidebar toggle, model picker, theme toggle, user menu.
 * Matches z.ai's compact top bar.
 */
import { useState, useEffect } from "react";
import { PanelLeft, Sun, Moon, Share2, MoreHorizontal, Check, ChevronsUpDown } from "lucide-react";
import { useAxonizStore, PROVIDER_CATALOG, type ProviderId } from "@/stores/axoniz-store";
import { cn } from "@/lib/utils";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const saved = localStorage.getItem("axoniz-theme") as "light" | "dark" | null;
    const initial = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("axoniz-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

export function ChatTopBar() {
  const { toggleSidebar, activeProvider, activeModel, setActiveProvider, setActiveModel, providers } = useAxonizStore();
  const { theme, toggle } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  const providerMeta = PROVIDER_CATALOG.find((p) => p.id === activeProvider);
  const displayModel = activeModel || providers[activeProvider]?.model || providerMeta?.popularModels[0] || "default";
  const displayProviderName = providerMeta?.name ?? activeProvider;

  // Group providers by category
  const localProviders = PROVIDER_CATALOG.filter((p) => p.category === "local");
  const cloudProviders = PROVIDER_CATALOG.filter((p) => p.category === "cloud");

  const selectProvider = (id: ProviderId, model: string) => {
    setActiveProvider(id);
    setActiveModel(model);
    setPickerOpen(false);
  };

  return (
    <header className="flex items-center gap-2 h-14 px-3 border-b border-border bg-background/95 backdrop-blur-sm">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
        title="Toggle sidebar"
      >
        <PanelLeft className="size-4" />
      </button>

      {/* Model picker */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 h-9 rounded-lg hover:bg-muted text-sm font-medium"
        >
          <span className="text-foreground">{displayProviderName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground text-xs">{displayModel}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </button>
        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPickerOpen(false)}
            />
            <div className="absolute left-0 top-full mt-1 w-[320px] rounded-xl border border-border bg-popover shadow-lg z-50 overflow-hidden">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border">
                Local providers
              </div>
              {localProviders.map((p) => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  activeId={activeProvider}
                  activeModel={displayModel}
                  onSelect={(m) => selectProvider(p.id, m)}
                />
              ))}
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-y border-border bg-muted/30">
                Cloud providers
              </div>
              {cloudProviders.map((p) => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  activeId={activeProvider}
                  activeModel={displayModel}
                  onSelect={(m) => selectProvider(p.id, m)}
                />
              ))}
              <div className="border-t border-border p-1">
                <button
                  onClick={() => setPickerOpen(false)}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1.5"
                >
                  Configure in Settings →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right side actions */}
      <div className="ml-auto flex items-center gap-1">
        <button
          className="size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          title="Share"
        >
          <Share2 className="size-4" />
        </button>
        <button
          onClick={toggle}
          className="size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button
          className="size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          title="More"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </header>
  );
}

function ProviderRow({
  provider,
  activeId,
  activeModel,
  onSelect,
}: {
  provider: (typeof PROVIDER_CATALOG)[number];
  activeId: ProviderId;
  activeModel: string;
  onSelect: (model: string) => void;
}) {
  const isActive = activeId === provider.id;
  return (
    <div className={cn("px-3 py-2", isActive && "bg-accent/30")}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{provider.name}</span>
          <span className="text-[10px] text-muted-foreground">{provider.description}</span>
        </div>
        {provider.category === "cloud" && provider.pricePerMTokIn > 0 && (
          <span className="text-[10px] text-muted-foreground">
            ${provider.pricePerMTokIn.toFixed(2)}/M in
          </span>
        )}
      </div>
      {provider.popularModels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {provider.popularModels.slice(0, 4).map((m) => (
            <button
              key={m}
              onClick={() => onSelect(m)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono border transition-colors",
                isActive && m === activeModel
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {isActive && m === activeModel && <Check className="size-2.5 inline mr-1" />}
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
