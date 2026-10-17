"use client";

/**
 * ThemeProvider — applies the active theme to <html data-theme="...">.
 *
 * Mounted as a wrapper around the app in `src/app/layout.tsx`. Reads
 * `activeTheme` from the Zustand store and sets
 * `document.documentElement.dataset.theme` to the theme id whenever it
 * changes. The actual visual work is done by the CSS variable overrides
 * in `src/app/globals.css` (each theme is a `[data-theme="<id>"]` block).
 *
 * Also sets the `dark` class on <html> because Tailwind v4's `darkMode`
 * is class-based (`darkMode: "class"` in tailwind.config.ts). AXONIZ
 * is dark-mode-only for now, so this is always on; if/when a light
 * theme is added, this can be tied to the theme metadata instead.
 *
 * Accepts children — preserves the wrapper-component API the root
 * layout was already using.
 */
import { useEffect, type ReactNode } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { getThemeById, DEFAULT_THEME_ID } from "@/lib/themes";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const activeTheme = useAxonizStore((s) => s.activeTheme);

  useEffect(() => {
    // Validate the theme id — if the store has an invalid id (e.g.
    // someone hand-edited localStorage), fall back to the default.
    // This is a defensive measure; the theme picker only ever sets
    // valid ids from the THEMES array.
    const theme = getThemeById(activeTheme);
    const themeId = theme?.id ?? DEFAULT_THEME_ID;

    const root = document.documentElement;
    if (themeId === DEFAULT_THEME_ID) {
      // For the default theme, remove the data-theme attribute so
      // the :root CSS variables in globals.css apply directly (no
      // [data-theme="default"] block needed — :root IS the default).
      delete root.dataset.theme;
    } else {
      root.dataset.theme = themeId;
    }

    // Always force dark mode for now — AXONIZ doesn't ship a light theme yet.
    // When a light theme is added, this can become conditional on the theme.
    root.classList.add("dark");
  }, [activeTheme]);

  // Render children — the side-effect on <html> is what makes the theme
  // visible. Mount this component as a wrapper in the root layout so
  // the effect runs once per page load.
  return <>{children}</>;
}

/** Re-export the theme list for consumers that need to render a picker. */
export { THEMES } from "@/lib/themes";
