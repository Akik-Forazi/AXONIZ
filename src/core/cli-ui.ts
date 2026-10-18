/**
 * AXONIZ CLI UI — rendering primitives inspired by gemini-cli, opencode, and claude-code.
 *
 * Design principles (learned from researching the actual source code of these CLIs):
 *
 * 1. **Filled-block ASCII art** (gemini-cli + claude-code style)
 *    Uses █ (full block) and ░ (light shade), not hollow #// characters.
 *    Multi-size variants (long/short/tiny) picked by terminal width.
 *
 * 2. **Semantic color roles** (gemini-cli semantic-colors.ts + copilot-cli AnimationElements)
 *    A `theme` object maps roles like `text.primary` or `status.ok` to ANSI codes.
 *    Hardcoded colors are forbidden outside the theme definition.
 *
 * 3. **Minimal prompt** (claude-code style)
 *    `❯ ` (just chevron + space) with a small colored mode dot before.
 *
 * 4. **⏺ tool call indicator** (claude-code style)
 *    One-line `⏺ tool_name(args)` + indented `  ✓ result` below.
 *
 * 5. **Multi-column footer** (gemini-cli Footer.tsx style)
 *    Width-fitting algorithm: drops low-priority columns when terminal
 *    narrow, appends `…` ellipsis when items dropped.
 *
 * 6. **Compact token format** (gemini-cli Footer.tsx technique)
 *    Uses `Intl.NumberFormat('en-US', { notation: 'compact' })` →
 *    `1.2k`, `3.4m`, `5.6b`.
 *
 * 7. **Boxed code blocks** (claude-code + gemini-cli Banner.tsx style)
 *    Rounded corners (╭─╮│╰─╯) with language label in top border.
 *
 * 8. **Inline streaming** (already done in current CLI)
 *    Tokens appear on the same line via direct `stdout.write`.
 */

import process from "node:process";

/* ── Color helpers (same as before, exposed for the theme) ──────────────── */

function tty(): boolean {
  return Boolean(process.stdout.isTTY);
}

function colorOk(): boolean {
  if (process.env.NO_COLOR) return false;
  return tty() || Boolean(process.env.FORCE_COLOR);
}

const HAS_COLOR = colorOk();
export const TW = process.stdout.columns || 100;

function e(code: string): string {
  return HAS_COLOR ? `\u001b[${code}m` : "";
}

/* ── Semantic theme (gemini-cli semantic-colors.ts pattern) ──────────────── */

/**
 * Theme roles — code NEVER references ANSI codes directly.
 * All rendering goes through `theme.text.primary`, `theme.status.ok`, etc.
 * This is the gemini-cli + copilot-cli pattern — it makes the UI themeable
 * later (light/dark/high-contrast) without touching rendering code.
 */
export const theme = {
  text: {
    primary: e("97"),       // bright white
    secondary: e("37"),     // light gray
    muted: e("90"),          // dark gray
    dim: e("2"),             // dim attribute
  },
  accent: {
    primary: e("95"),       // bright magenta (purple) — AXONIZ brand
    secondary: e("96"),     // bright cyan
    tertiary: e("94"),      // bright blue
  },
  status: {
    ok: e("92"),            // bright green
    warn: e("93"),           // bright yellow
    error: e("91"),          // bright red
  },
  ui: {
    border: e("90"),        // dark gray for borders
    divider: e("90"),       // dark gray for dividers
    comment: e("90"),       // dark gray for comments
  },
  code: {
    keyword: e("95"),       // purple
    string: e("92"),        // green
    number: e("93"),        // yellow
    comment: e("90"),       // dark gray
  },
} as const;

/** Reset escape — used everywhere as `R` */
export const R = e("0");
export const B = e("1");  // bold
export const I = e("3");  // italic

/* ── Filled-block ASCII art (gemini-cli AsciiArt.ts style) ──────────────── */

/**
 * Three size variants of the AXONIZ logo. The Header picks the largest
 * one that fits the terminal width — same technique as gemini-cli's
 * Header.tsx.
 *
 * Uses █ (full block) and ░ (light shade) — NOT hollow #// characters.
 * This is the claude-code style that gemini-cli copied.
 */

// Long logo — needs ~56 cols (with side padding)
export const LONG_LOGO = [
  " █████  ██   ██  ██████   █████  █████ ██████   █████ ",
  "░███░░  ░░███░░ ░░██████ ░░███  ░░███ ░░██████ ░░███ ",
  " ░░░░██   ░███    ░███░███ ░███  ░███  ░███░███ ░███ ",
  "   ████   ░███    ░███ ░░  ░███  ░███  ░███ ░░██████ ",
  "  ░░░███  ░███    ░███     ░███  ░███  ░███  ░░█████ ",
  "   ███░ ░███     ░███     ░███  ░███  ░███   ░░████ ",
  "  ██████  ██████ █████     █████ █████ █████  ░░████ ",
  " ░░░░░  ░░░░░░ ░░░░░     ░░░░░ ░░░░░ ░░░░░    ░░░░ ",
];

// Short logo — needs ~30 cols
export const SHORT_LOGO = [
  "  █████  ██  ██ ██████  █████ ██████ ",
  " ░███░░  ░░███░░ ░░██████ ░░███ ░░██████ ",
  " ░░░░██   ░███    ░███░███ ░███  ░███░███ ",
  "   ████   ░███    ░███░░   ░███  ░███░░██████ ",
  "  ░░░███  ░███    ░███     ░███  ░███ ░░█████ ",
  "   ███░ ░███     ░███     ░███  ░███  ░░████ ",
  "  ██████  ██████ █████    █████ █████  ░░████ ",
  " ░░░░░  ░░░░░░ ░░░░░    ░░░░░ ░░░░░    ░░░░ ",
];

// Tiny logo — fits in 20 cols
export const TINY_LOGO = [
  " █████ ██  ██ ███████",
  "░███░░ ░░███░░ ░░██████ ",
  " ░░░░██  ░███   ░███░███ ",
  "  ████   ░███   ░███░░ ",
  " ░░░███  ░███   ░███   ",
  "  ███░  ░███   ░███   ",
  " ██████ █████  █████   ",
  "░░░░░  ░░░░░  ░░░░░    ",
];

/** Get the visual width of the widest line in a multi-line string. */
function asciiWidth(lines: string[]): number {
  return lines.reduce((max, l) => Math.max(max, l.length), 0);
}

/** Pick the largest logo that fits the terminal width (gemini-cli Header.tsx technique). */
export function pickLogoByWidth(terminalWidth: number = TW): string[] {
  const longW = asciiWidth(LONG_LOGO);
  const shortW = asciiWidth(SHORT_LOGO);
  if (terminalWidth - 4 >= longW) return LONG_LOGO;
  if (terminalWidth - 4 >= shortW) return SHORT_LOGO;
  return TINY_LOGO;
}

/* ── Box-drawing chars (rounded for code, square for banner) ───────────── */

const BOX = {
  tl: "\u256d",  // ╭
  tr: "\u256e",  // ╮
  bl: "\u2570",  // ╰
  br: "\u256f",  // ╯
  h:  "\u2500",  // ─
  v:  "\u2502",  // │
  stl: "\u250c", // ┌
  str: "\u2510", // ┐
  sbl: "\u2514", // └
  sbr: "\u2518", // ┘
  dot: "\u00b7", // ·
  arrow: "\u203a", // ›
  chev: "\u276f",  // ❯
  circ: "\u2b24",  // ⬤
  smcirc: "\u25cf", // ●
  ring: "\u25cb",  // ○
  tool: "\u23fa",  // ⏺
  check: "\u2713", // ✓
  cross: "\u2717", // ✗
  warn: "\u26a0",  // ⚠
  tri: "\u25b8",   // ▸
  dot3: "\u2026",  // …
  mid: "\u00b7",   // ·
  star: "\u2605",  // ★
  diamond: "\u25c8", // ◈
  flower: "\u2698",   // ⚘
} as const;

/* ── Compact number formatting (gemini-cli Footer.tsx technique) ─────────── */

/**
 * Format a number in compact notation: 1234 → "1.2k", 1234567 → "1.2m".
 * Same technique as gemini-cli's Footer.tsx token-count column.
 */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return formatter.format(n).toLowerCase();
}

/* ── Visual width (strip ANSI codes when measuring) ─────────────────────── */

/** Strip ANSI escape sequences to get the visual width of a string. */
export function visualWidth(s: string): number {
  return s.replace(/\u001b\[\d+m/g, "").length;
}

/** Pad a string to `width` visual columns, accounting for ANSI codes. */
export function padToWidth(s: string, width: number): string {
  const w = visualWidth(s);
  if (w >= width) return s;
  return s + " ".repeat(width - w);
}

/* ── Banner (gemini-cli Banner.tsx pattern) ────────────────────────────── */

/**
 * Print the startup banner — picks the largest ASCII art logo that fits
 * the terminal width, then prints a single-line summary below with
 * provider + model + version.
 */
export function printBanner(model = "", backend = "", version = "0.1.8"): void {
  const logo = pickLogoByWidth();
  console.log();
  // Logo in brand purple (filled blocks look great in purple)
  for (const line of logo) {
    console.log(`  ${theme.accent.primary}${line}${R}`);
  }
  // Single-line summary below
  console.log(`  ${theme.text.muted}v${version} \u00b7 ${theme.text.primary}local-first AI agent${R}`);
  console.log(`  ${theme.text.muted}provider${R} ${theme.accent.secondary}${backend || "auto"}${R}  ${theme.text.muted}model${R} ${theme.text.secondary}${model || "auto"}${R}`);
  console.log();
}

/* ── Prompt (claude-code minimal style) ──────────────────────────────────── */

/**
 * Build the prompt string. Minimal: colored mode dot + `❯ ` + space.
 *
 * Mode colors:
 *   - agent: cyan (action-oriented)
 *   - chat:  gray (passive, low-stakes)
 *   - goal:  purple (autonomous, ambitious)
 *
 * No "agent axoniz›" text — that's clutter. The mode dot conveys the mode,
 * the cwd is shown in the footer (gemini-cli pattern).
 */
export function buildPrompt(mode: "agent" | "chat" | "goal" = "agent", cwd?: string): string {
  const modeColor = {
    agent: theme.accent.secondary,  // cyan
    goal: theme.accent.primary,     // purple
    chat: theme.text.muted,         // gray
  }[mode] ?? theme.text.muted;
  const dot = `${modeColor}${BOX.smcirc}${R}`;
  const chev = `${theme.text.muted}${BOX.chev}${R}`;
  const cwdStr = cwd ? `${theme.text.muted}${require$basename(cwd)}${R} ` : "";
  return `\n  ${dot} ${cwdStr}${chev} `;
}

/* ── Footer (gemini-cli Footer.tsx multi-column pattern) ────────────────── */

export interface FooterData {
  cwd?: string;
  gitBranch?: string;
  model?: string;
  provider?: string;
  tokens?: number;
  elapsedSec?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isCloud?: boolean;
}

/**
 * Print the footer — multi-column row with width-fitting.
 *
 * Columns in priority order (high → low):
 *   1. model (always shown)
 *   2. tokens (compact: 1.2k)
 *   3. elapsed
 *   4. cwd (truncated to fit remaining space)
 *   5. git-branch
 *   6. code-changes (+N -N)
 *
 * If the terminal is too narrow, low-priority columns are dropped
 * and `…` is appended to indicate something was hidden.
 * (Same algorithm as gemini-cli Footer.tsx.)
 */
export function printFooter(data: FooterData): void {
  const SEP = ` ${theme.text.muted}${BOX.mid}${R} `;
  const cols: Array<{ id: string; text: string; minWidth: number; highPriority?: boolean }> = [];

  // 1. Model (high priority — always shown)
  if (data.model || data.provider) {
    const m = data.provider && data.model
      ? `${data.provider}/${data.model}`.slice(0, 40)
      : (data.provider ?? data.model ?? "auto");
    cols.push({
      id: "model",
      text: `${theme.accent.secondary}${m}${R}`,
      minWidth: visualWidth(m),
      highPriority: true,
    });
  }

  // 2. Tokens (compact format)
  if (data.tokens !== undefined && data.tokens > 0) {
    const t = `${compactNumber(data.tokens)} tokens`;
    cols.push({
      id: "tokens",
      text: `${theme.text.secondary}${compactNumber(data.tokens)}${R}${theme.text.muted} tokens${R}`,
      minWidth: visualWidth(t),
    });
  }

  // 3. Elapsed
  if (data.elapsedSec !== undefined && data.elapsedSec > 0) {
    const t = data.elapsedSec >= 60
      ? `${Math.floor(data.elapsedSec / 60)}m${data.elapsedSec % 60}s`
      : `${data.elapsedSec}s`;
    cols.push({
      id: "elapsed",
      text: `${theme.text.muted}${t}${R}`,
      minWidth: visualWidth(t),
    });
  }

  // 4. Code changes (+N -N) — only if non-zero
  if ((data.linesAdded ?? 0) > 0 || (data.linesRemoved ?? 0) > 0) {
    const a = data.linesAdded ?? 0;
    const r = data.linesRemoved ?? 0;
    const str = `+${a} -${r}`;
    cols.push({
      id: "diff",
      text: `${theme.status.ok}+${a}${R} ${theme.status.error}-${r}${R}`,
      minWidth: visualWidth(str),
    });
  }

  // 5. cwd (flexible width — gets remaining space)
  if (data.cwd) {
    cols.push({
      id: "cwd",
      text: `${theme.text.muted}${require$basename(data.cwd)}${R}`,
      minWidth: 8,
    });
  }

  // 6. git-branch (lowest priority)
  if (data.gitBranch) {
    cols.push({
      id: "git",
      text: `${theme.text.muted}${data.gitBranch}${R}`,
      minWidth: visualWidth(data.gitBranch),
    });
  }

  // Width-fitting algorithm (gemini-cli Footer.tsx technique)
  const maxWidth = TW - 4;  // 2 cols padding each side
  const columnsToShow: typeof cols = [];
  let usedWidth = 0;
  let droppedAny = false;

  for (const col of cols) {
    const gap = columnsToShow.length > 0 ? 3 : 0;  // 3 = SEP visual width
    const budgetWidth = col.id === "cwd" ? Math.min(col.minWidth, 20) : col.minWidth;
    if (col.highPriority || usedWidth + gap + budgetWidth <= maxWidth) {
      columnsToShow.push(col);
      usedWidth += gap + budgetWidth;
    } else {
      droppedAny = true;
    }
  }

  // Build the row
  const parts = columnsToShow.map((c) => c.text);
  if (droppedAny) parts.push(`${theme.text.muted}${BOX.dot3}${R}`);
  console.log(`\n  ${parts.join(SEP)}`);
}

/* ── Tool call rendering (claude-code ⏺ style) ──────────────────────────── */

/**
 * Print a tool call indicator — one line for the call, then below it
 * the result with a ✓/✗ mark.
 *
 *   ⏺ tool_name  arg1=value1 arg2=value2
 *     ✓ result preview (truncated)
 */
export function printToolCall(name: string, args: Record<string, unknown>): void {
  const argStr = Object.entries(args)
    .slice(0, 2)
    .map(([k, v]) => `${theme.text.muted}${k}${R}=${theme.accent.tertiary}${String(v).slice(0, 40)}${R}`)
    .join(" ");
  console.log(`  ${theme.accent.primary}${BOX.tool}${R} ${theme.accent.secondary}${name}${R}  ${argStr}`);
}

export function printToolResult(result: string, failed = false): void {
  const icon = failed
    ? `${theme.status.error}${BOX.cross}${R}`
    : `${theme.status.ok}${BOX.check}${R}`;
  let preview = result.trim().replace(/\n/g, " ").slice(0, 100);
  if (preview.length >= 100) preview += `${theme.text.muted}${BOX.dot3}${R}`;
  const color = failed ? theme.status.error : theme.text.muted;
  console.log(`    ${icon} ${color}${preview}${R}`);
}

/* ── Code blocks (claude-code + gemini-cli Banner.tsx rounded style) ────── */

/**
 * Render a fenced code block inside a rounded box with the language label
 * in the top border. Same style as claude-code's code blocks.
 */
export function printCodeBlock(code: string[], lang: string): void {
  const inner = Math.min(TW - 6, 72);
  const label = (lang || "code").toUpperCase();
  const labelStr = ` ${theme.accent.secondary}${label}${R}${theme.ui.border} `;
  const barLen = Math.max(0, inner + 2 - label.length - 2);
  console.log(`  ${theme.ui.border}${BOX.tl}${BOX.h.repeat(inner + 2)}${BOX.tr}${R}`);
  console.log(`  ${theme.ui.border}${BOX.v}${R}${labelStr}${theme.ui.border}${BOX.h.repeat(barLen)}${BOX.v}${R}`);
  for (const c of code) {
    const line = c.length > inner ? c.slice(0, inner - 1) + BOX.dot3 : c.padEnd(inner);
    console.log(`  ${theme.ui.border}${BOX.v}${R} ${theme.accent.tertiary}${line}${R} ${theme.ui.border}${BOX.v}${R}`);
  }
  console.log(`  ${theme.ui.border}${BOX.bl}${BOX.h.repeat(inner + 2)}${BOX.br}${R}`);
}

/* ── Spinner (braille dots, gemini-cli CliSpinner.tsx style) ─────────────── */

const SPINNER_FRAMES = ["\u2802", "\u2812", "\u2810", "\u2830", "\u2828", "\u2840", "\u2844", "\u2804"];

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private i = 0;

  constructor(private text = "thinking", private delay = 80) {}

  start(text?: string): void {
    if (!tty()) return;
    if (text !== undefined) this.text = text;
    if (this.timer) return;
    this.timer = setInterval(() => {
      const f = SPINNER_FRAMES[this.i++ % SPINNER_FRAMES.length];
      const line = `  ${theme.accent.secondary}${f}${R} ${theme.text.muted}${this.text}${R}`;
      const pad = " ".repeat(Math.max(0, TW - visualWidth(line) + 4));
      process.stdout.write(`\r${line}${pad}`.slice(0, TW));
    }, this.delay);
    this.timer.unref?.();
  }

  setText(text: string): void {
    this.text = text;
  }

  stop(finalText?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write(`\r${" ".repeat(Math.min(TW, 100))}\r`);
      if (finalText) console.log(`  ${finalText}`);
    }
  }
}

/* ── Inline markdown (very small subset, for response rendering) ────────── */

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, `${theme.text.primary}${B}$1${R}${theme.text.secondary}`)
    .replace(/\*(.*?)\*/g, `${theme.text.muted}${I}$1${R}${theme.text.secondary}`)
    .replace(/`([^`\n]+)`/g, `${theme.accent.tertiary}$1${R}${theme.text.secondary}`);
}

/**
 * Render a model response with markdown formatting + boxed code blocks.
 * Bullets use ▸ (top-level) + ‣ (nested) — same as claude-code.
 */
export function printResponse(text: string, prefix = "  "): void {
  if (!text) return;
  console.log();

  const lines = text.split("\n");
  let inCode = false;
  let codeBuf: string[] = [];
  let codeLang = "";

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
      } else {
        inCode = false;
        printCodeBlock(codeBuf, codeLang);
        codeBuf = [];
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const s = line.replace(/\s+$/, "");
    if (!s.trim()) {
      console.log();
      continue;
    }

    if (/^\s*[-*]\s+/.test(s)) {
      const body = s.replace(/^\s*[-*]\s+/, "").trim();
      console.log(`${prefix}${theme.accent.secondary}${BOX.tri}${R} ${inlineMarkdown(body)}${R}`);
      continue;
    }

    if (/^ {2,}[-*]\s+/.test(s)) {
      const body = s.replace(/^\s*[-*]\s+/, "").trim();
      console.log(`${prefix}  ${theme.text.muted}\u2023${R} ${inlineMarkdown(body)}${R}`);
      continue;
    }

    const num = s.match(/^(\s*)(\d+)\. (.*)/);
    if (num) {
      console.log(`${prefix}${theme.accent.secondary}${num[2]}.${R} ${inlineMarkdown(num[3])}${R}`);
      continue;
    }

    console.log(`${prefix}${theme.text.secondary}${inlineMarkdown(s)}${R}`);
  }

  if (inCode && codeBuf.length > 0) printCodeBlock(codeBuf, codeLang);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function require$basename(p: string): string {
  const norm = p.replace(/[\\/]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/* ── Welcome message ─────────────────────────────────────────────────────── */

/**
 * Print the welcome one-liner that appears once after the banner.
 * Compact: shows the most useful commands + key shortcuts.
 */
export function printWelcome(webUrl?: string): void {
  console.log(`  ${theme.text.muted}type${R} ${theme.accent.secondary}/help${R} ${theme.text.muted}for commands \u00b7 Ctrl-C clears line \u00b7 exit to quit${R}`);
  if (webUrl) {
    console.log(`  ${theme.text.muted}web${R} ${theme.accent.tertiary}${webUrl}${R}`);
  }
  console.log();
}
