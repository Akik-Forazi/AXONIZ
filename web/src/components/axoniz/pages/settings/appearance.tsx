"use client";

import { Palette, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAxonizStore } from "@/stores/axoniz-store";
import { THEMES } from "@/lib/themes";

export function AppearanceSettingsPage() {
  const activeTheme = useAxonizStore((s) => s.activeTheme);
  const setTheme = useAxonizStore((s) => s.setTheme);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Palette className="w-3.5 h-3.5" />Appearance
        </h2>
      </div>
      <div className="p-4 max-w-2xl space-y-4">
        {/* THEME PICKER — replaces the old "Forced" badge.
            Each theme is rendered as a swatch card with the theme's
            actual background + accent colors. Clicking selects it
            (the store updates → ThemeProvider swaps <html data-theme>),
            CSS variables cascade, the entire app re-tints instantly. */}
        <Card className="glass elev-2 smooth p-4 space-y-3">
          <div>
            <div className="text-[13px] font-medium">Theme</div>
            <div className="text-[11px] text-muted-foreground/80 mt-0.5">
              Pick a visual theme. The choice persists across refresh and applies to every page.
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {THEMES.map((t) => {
              const active = t.id === activeTheme;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`group relative flex items-start gap-3 p-3 rounded-md border text-left transition-colors ${
                    active
                      ? "border-foreground/25 bg-foreground/5"
                      : "border-border hover:border-foreground/15 hover:bg-foreground/2"
                  }`}
                >
                  {/* Swatch preview — uses the theme's actual background + accent
                      colors so the user can see what they're picking before they
                      click. The outer box is the background, the inner dot is
                      the accent. */}
                  <div
                    className="w-12 h-12 rounded border border-border/60 flex items-center justify-center shrink-0"
                    style={{ background: t.swatchBg }}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ background: t.swatch, boxShadow: `0 0 12px ${t.swatch}` }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium flex items-center gap-1.5">
                      {t.name}
                      {active && <Check className="w-3 h-3 text-accent" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">
                      {t.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-muted-foreground/60 pt-1 font-mono">
            To add a new theme: add a <code className="text-foreground/80">[data-theme="&lt;id&gt;"]</code> block to <code className="text-foreground/80">globals.css</code>, then an entry to <code className="text-foreground/80">THEMES</code> in <code className="text-foreground/80">lib/themes.ts</code>.
          </div>
        </Card>

        <Card className="glass elev-2 smooth p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Reduced motion</div>
              <div className="text-[11px] text-muted-foreground/80 mt-0.5">Disables entrance animations and blink indicators</div>
            </div>
            <Switch defaultChecked={false} />
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div>
              <div className="text-[13px] font-medium">Compact density</div>
              <div className="text-[11px] text-muted-foreground/80 mt-0.5">Tighter spacing and smaller fonts</div>
            </div>
            <Switch defaultChecked />
          </div>
        </Card>

        {/* LIVE TOKEN ROWS — these now reflect the active theme's CSS
            variables (via `var(--name)`), so they update instantly when
            the user switches themes. Useful for designers debugging. */}
        <Card className="glass elev-2 smooth p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Color tokens (live)</div>
          <div className="space-y-2 text-[11px] font-mono">
            <TokenRow name="--background" comment="canvas" />
            <TokenRow name="--card" comment="surface" />
            <TokenRow name="--primary" comment="primary action" />
            <TokenRow name="--accent" comment="highlights / focus" />
            <TokenRow name="--border" comment="hairline" />
            <TokenRow name="--ring" comment="focus ring" />
            <TokenRow name="--destructive" comment="errors only" />
          </div>
        </Card>
      </div>
    </div>
  );
}

/** A row that reads its color directly from the active theme's CSS variable.
 *  Updates instantly when the theme changes — no React state needed because
 *  the browser re-resolves `var(--name)` whenever <html data-theme> changes. */
function TokenRow({ name, comment }: { name: string; comment?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-border last:border-b-0">
      <span className="text-muted-foreground w-28">{name}</span>
      <span className="text-foreground/80 flex-1 font-mono text-[10px] truncate" style={{ color: `var(${name})` }}>
        {/* show the resolved color as the value text */}
        active
      </span>
      {comment && <span className="text-muted-foreground/60 text-[10px]">{comment}</span>}
      <div className="w-4 h-4 rounded border border-border" style={{ background: `var(${name})` }} />
    </div>
  );
}
