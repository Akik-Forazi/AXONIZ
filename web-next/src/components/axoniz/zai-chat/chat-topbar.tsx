"use client";
/**
 * Chat top bar — sidebar toggle, model picker, theme toggle, user menu.
 * Matches z.ai's compact top bar.
 *
 * Model picker is FULLY DYNAMIC:
 *   - On picker open, each provider row fetches its real model list via
 *     /api/axoniz/providers/test (live /v1/models endpoint).
 *   - 5-min cache per (provider, baseUrl, apiKey).
 *   - If the live fetch fails or returns no models: shows provider-specific
 *     empty-state guidance —
 *       local providers: "Start your {provider} server at {baseUrl}, then Refresh"
 *       cloud providers: "Check your API key in Settings → Providers + verify internet"
 *   - NO HARDCODED FALLBACK. The catalog's `popularModels` list is no longer
 *     used for display — only the `description` and `category` fields.
 */
import { useState, useEffect } from "react";
import { PanelLeft, Sun, Moon, Share2, MoreHorizontal, Check, ChevronsUpDown, RefreshCw, AlertCircle, Loader2, Server, Wifi } from "lucide-react";
import { useAxonizStore, PROVIDER_CATALOG, type ProviderId } from "@/stores/axoniz-store";
import { cn } from "@/lib/utils";
import { useLiveModels } from "./use-live-models";

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
  const { toggleSidebar, activeProvider, activeModel, setActiveProvider, setActiveModel, providers, llamacpp } = useAxonizStore();
  const { theme, toggle } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  const providerMeta = PROVIDER_CATALOG.find((p) => p.id === activeProvider);
  const providerConfig = providers[activeProvider];
  const effectiveBaseUrl = activeProvider === "llamacpp"
    ? llamacpp.baseUrl || providerConfig.baseUrl
    : providerConfig.baseUrl;
  const displayModel = activeModel || providerConfig.model || "(no model selected)";
  const displayProviderName = providerMeta?.name ?? activeProvider;

  const localProviders = PROVIDER_CATALOG.filter((p) => p.category === "local");
  const cloudProviders = PROVIDER_CATALOG.filter((p) => p.category === "cloud");

  const selectProvider = (id: ProviderId, model: string) => {
    setActiveProvider(id);
    setActiveModel(model);
    setPickerOpen(false);
  };

  return (
    <header className="flex items-center gap-2 h-14 px-3 border-b border-border bg-background/95 backdrop-blur-sm">
      <button
        onClick={toggleSidebar}
        className="size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
        title="Toggle sidebar"
      >
        <PanelLeft className="size-4" />
      </button>

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
            <div className="absolute left-0 top-full mt-1 w-[340px] rounded-xl border border-border bg-popover shadow-lg z-50 overflow-hidden max-h-[480px] overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border bg-muted/30">
                Local providers — model list fetched live from your server
              </div>
              {localProviders.map((p) => {
                const cfg = providers[p.id];
                const baseUrl = p.id === "llamacpp"
                  ? llamacpp.baseUrl || cfg.baseUrl
                  : cfg.baseUrl;
                return (
                  <ProviderRow
                    key={p.id}
                    provider={p}
                    activeId={activeProvider}
                    activeModel={displayModel}
                    baseUrl={baseUrl}
                    apiKey={cfg.apiKey}
                    onSelect={(m) => selectProvider(p.id, m)}
                  />
                );
              })}
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-y border-border bg-muted/30">
                Cloud providers — model list fetched live from API
              </div>
              {cloudProviders.map((p) => {
                const cfg = providers[p.id];
                return (
                  <ProviderRow
                    key={p.id}
                    provider={p}
                    activeId={activeProvider}
                    activeModel={displayModel}
                    baseUrl={cfg.baseUrl}
                    apiKey={cfg.apiKey}
                    onSelect={(m) => selectProvider(p.id, m)}
                  />
                );
              })}
              <div className="border-t border-border p-1">
                <button
                  onClick={() => setPickerOpen(false)}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1.5"
                >
                  Configure providers in Settings →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

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
  baseUrl,
  apiKey,
  onSelect,
}: {
  provider: (typeof PROVIDER_CATALOG)[number];
  activeId: ProviderId;
  activeModel: string;
  baseUrl: string;
  apiKey: string;
  onSelect: (model: string) => void;
}) {
  const isActive = activeId === provider.id;
  const { models, loading, error, source, category, emptyHint, refetch } =
    useLiveModels(provider.id, baseUrl, apiKey);

  // Truncate long model ids for chip display
  const chipId = (id: string): string => {
    if (id.length > 28) return id.slice(0, 25) + "…";
    return id;
  };

  return (
    <div className={cn("px-3 py-2 border-b border-border/50 last:border-0", isActive && "bg-accent/20")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{provider.name}</span>
            {source === "live" && models.length > 0 && (
              <span className="text-[9px] text-emerald-500 font-semibold">
                ● LIVE
              </span>
            )}
            {source === "cache" && (
              <span className="text-[9px] text-blue-500 font-semibold">
                ● CACHED
              </span>
            )}
            {source === "empty" && !loading && (
              <span className="text-[9px] text-amber-500 font-semibold">
                ● NO MODELS
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground line-clamp-1">
            {provider.description}
          </span>
          {baseUrl && (
            <span className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
              {baseUrl}
            </span>
          )}
        </div>
        {provider.category === "cloud" && provider.pricePerMTokIn > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            ${provider.pricePerMTokIn.toFixed(2)}/M in
          </span>
        )}
      </div>

      {/* Model chips / loading / empty state */}
      <div className="mt-1.5">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
            <Loader2 className="size-3 animate-spin" />
            Fetching live models…
          </div>
        )}

        {!loading && models.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {models.slice(0, 8).map((m) => {
              const selected = isActive && m.id === activeModel;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  title={m.id + (m.contextLength ? ` · ${m.contextLength} ctx` : "")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-mono border transition-colors",
                    selected
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  {selected && <Check className="size-2.5 inline mr-1" />}
                  {chipId(m.id)}
                </button>
              );
            })}
            {models.length > 8 && (
              <span className="text-[10px] text-muted-foreground self-center ml-1">
                +{models.length - 8} more
              </span>
            )}
          </div>
        )}

        {!loading && models.length === 0 && (
          <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
            <div className="flex items-start gap-1.5">
              {category === "local" ? (
                <Server className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <Wifi className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  No models found
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {emptyHint}
                </div>
                {error && (
                  <div className="text-[10px] text-red-500 mt-1 font-mono break-all">
                    {error}
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    refetch();
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-foreground hover:underline"
                >
                  <RefreshCw className="size-2.5" />
                  Retry fetch
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
