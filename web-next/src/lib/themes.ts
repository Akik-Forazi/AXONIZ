/**
 * AXONIZ themes — list of available themes + their metadata.
 *
 * Adding a new theme:
 * 1. Add a `[data-theme="<id>"]` block to `src/app/globals.css` that
 *    overrides the same `--background`, `--foreground`, `--card`,
 *    `--primary`, `--accent`, `--border`, etc. CSS variables.
 * 2. Add a matching `.dark[data-theme="<id>"]` block (so dark mode
 *    toggle still works on top of the theme).
 * 3. Add an entry to the `THEMES` array below with the same `id`.
 *
 * The active theme is stored in the Zustand store (`activeTheme`) and
 * applied to `<html data-theme="<id>">` by `<ThemeProvider />` in the
 * root layout. Persisted to localStorage so the choice survives refresh.
 */

export interface Theme {
  /** The id used in `data-theme="..."` and the store. Must match the
   *  CSS block in globals.css. */
  id: string;
  /** Human-readable name shown in the Settings → Appearance picker. */
  name: string;
  /** Short description shown under the name in the picker. */
  description: string;
  /** A tiny color preview — the primary accent of the theme, used to
   *  render a small swatch in the picker. Must be a valid CSS color. */
  swatch: string;
  /** The background color of the theme — used for the second swatch. */
  swatchBg: string;
}

export const THEMES: Theme[] = [
  {
    id: "default",
    name: "Monochrome Dark",
    description: "Near-black canvas, pure white accents, hairline borders. The original AXONIZ aesthetic.",
    swatch: "#f5f5f5",
    swatchBg: "#1a1a1a",
  },
  {
    id: "shadow-monarch",
    name: "Shadow Monarch",
    description: "Deep void-purple-black + glowing monarch violet. Sung Jin-woo's shadow energy — restrained, intense, alive.",
    swatch: "#a855f7",
    swatchBg: "#0a0612",
  },
];

/** Default theme id used on first load (before the user has chosen). */
export const DEFAULT_THEME_ID = "default";

/** Get a Theme by id (or null if not found). */
export function getThemeById(id: string): Theme | null {
  return THEMES.find((t) => t.id === id) ?? null;
}
