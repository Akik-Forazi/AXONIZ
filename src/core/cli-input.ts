/**
 * AXONIZ — Bordered input box + persistent status bar + slash autocomplete.
 *
 * This module replaces the readline-based prompt with a raw-stdin input
 * handler that renders:
 *
 *   ┌─ workspace ~/axoniz · branch main ────────────────────────┐
 *   │                                                            │
 *   │ ▸ <user input here>                                        │
 *   │                                                            │
 *   └─ orca / glm-4.7-flash · 12,345 tokens · 6% ctx ───────────╯
 *
 * When the user types `/`, a popup appears above the box with the
 * filtered slash-command list. Tab completes the highlighted item,
 * Up/Down navigate, Escape dismisses.
 */
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { C, HAS_COLOR, TW } from "./cli.js";

/* ── ANSI escape sequences ───────────────────────────────────────────────── */

const ANSI = {
  // Cursor
  UP: (n: number) => `\u001b[${n}A`,
  DOWN: (n: number) => `\u001b[${n}B`,
  RIGHT: (n: number) => `\u001b[${n}C`,
  LEFT: (n: number) => `\u001b[${n}D`,
  HOME: `\u001b[H`,
  COL: (n: number) => `\u001b[${n}G`,
  SAVE: `\u001b7`,
  RESTORE: `\u001b8`,
  CLEAR_LINE: `\u001b[2K`,
  CLEAR_BELOW: `\u001b[J`,
  HIDE_CURSOR: `\u001b[?25l`,
  SHOW_CURSOR: `\u001b[?25h`,
  // Colors (dimmed for chrome)
  DIM: `\u001b[2m`,
  RESET: `\u001b[0m`,
};

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface StatusBarInfo {
  workspace: string;
  branch: string | null;
  provider: string;
  model: string;
  tokensUsed: number;
  contextMax: number;  // 0 = unknown
}

export interface InputBoxOptions {
  onSubmit: (text: string) => void;
  onAbort: () => void;  // Ctrl-D or Ctrl-C twice
  slashCommands?: string[];
  statusBar?: () => StatusBarInfo;
  placeholder?: string;
}

/* ── Slash command filter + matching ────────────────────────────────────── */

/** Return commands that match the typed prefix (e.g. "/mo" → ["/mode", "/model", "/models"]). */
export function filterSlashCommands(typed: string, commands: string[]): string[] {
  if (!typed.startsWith("/")) return [];
  return commands.filter((c) => c.startsWith(typed)).slice(0, 8);
}

/* ── Git branch helper ──────────────────────────────────────────────────── */

export function getCurrentBranch(workspace: string): string | null {
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: workspace,
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/* ── The input box + status bar ─────────────────────────────────────────── */

/**
 * Renders a bordered input box at the bottom of the terminal with:
 *   - Top border: workspace + git branch + (provider hint if set)
 *   - Middle:    the user's input with a `▸` prefix
 *   - Bottom:    provider / model · tokens · context %
 *
 * The caller is responsible for clearing the previous render before
 * calling render() again (typically via render() return value which
 * contains the ANSI sequences to clear + redraw).
 */
export class InputBox {
  private buffer = "";
  private cursorPos = 0;
  private popupOpen = false;
  private popupIndex = 0;
  private popupItems: string[] = [];
  private isRaw = false;
  private submitHandler: (text: string) => void;
  private abortHandler: () => void;
  private slashCommands: string[];
  private statusFn: (() => StatusBarInfo) | null;
  private placeholder: string;

  constructor(opts: InputBoxOptions) {
    this.submitHandler = opts.onSubmit;
    this.abortHandler = opts.onAbort;
    this.slashCommands = opts.slashCommands ?? [];
    this.statusFn = opts.statusBar ?? null;
    this.placeholder = opts.placeholder ?? "Ask anything. Type / for commands.";
  }

  /** Start raw stdin mode + render the initial input box. */
  start(): void {
    if (!process.stdin.isTTY) {
      // Fallback: plain readline-style prompt (handled by the caller)
      return;
    }
    this.isRaw = true;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", this.onData);
    this.render();
  }

  /** Stop raw stdin mode + clear the input box. */
  stop(): void {
    if (!this.isRaw) return;
    process.stdin.removeListener("data", this.onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    this.isRaw = false;
    this.clear();
  }

  /** Render the bordered input box at the current cursor position. */
  private render(): void {
    this.clear();
    const width = Math.min(TW, 100);
    const innerWidth = width - 4;  // 2 for borders + 2 padding

    // Status info for the borders
    const status = this.statusFn?.() ?? null;
    const topMeta = status
      ? ` ${C.DG}${status.workspace}${C.R}${status.branch ? ` ${C.DG}· ${C.AC}${status.branch}${C.R}` : ""} `
      : "";
    const botMeta = status
      ? ` ${C.CY}${status.provider}${C.R}${C.DG}/${C.R}${C.GR}${status.model || "auto"}${C.R}` +
        (status.tokensUsed > 0
          ? ` ${C.DG}·${C.R} ${C.GR}${status.tokensUsed.toLocaleString()}${C.R} ${C.DG}tokens${C.R}` +
            (status.contextMax > 0
              ? ` ${C.DG}·${C.R} ${C.GR}${Math.round(status.tokensUsed / status.contextMax * 100)}%${C.R} ${C.DG}ctx${C.R}`
              : "")
          : "")
      : "";

    // Top border with workspace+branch embedded
    const topLabel = topMeta.length;
    const topPad = Math.max(0, innerWidth + 2 - topLabel);
    const top = `${C.DG}╭─${C.R}${topMeta}${C.DG}${"─".repeat(topPad)}${C.R}${C.DG}╮${C.R}`;

    // Middle: input row with ▸ prefix + placeholder when empty
    const inputDisplay = this.buffer || "";
    const prefix = `${C.AC}▸${C.R} `;
    const placeholderStr = this.buffer ? "" : `${C.DG}${this.placeholder}${C.R}`;
    const inputLine = ` ${prefix}${inputDisplay}${placeholderStr}`;
    const inputPad = Math.max(0, innerWidth + 1 - inputLine.length);
    const middle = `${C.DG}│${C.R}${inputLine}${" ".repeat(inputPad)}${C.DG}│${C.R}`;

    // Bottom border with provider+model+tokens embedded
    const botLabel = botMeta.length;
    const botPad = Math.max(0, innerWidth + 2 - botLabel);
    const bot = `${C.DG}╰─${C.R}${botMeta}${C.DG}${"─".repeat(botPad)}${C.R}${C.DG}╯${C.R}`;

    // Popup (when /commands filtered)
    let popup = "";
    if (this.popupOpen && this.popupItems.length > 0) {
      popup = "\n";
      const maxLen = Math.max(...this.popupItems.map((s) => s.length));
      const popWidth = Math.min(maxLen + 4, innerWidth);
      for (let i = 0; i < this.popupItems.length; i++) {
        const item = this.popupItems[i];
        const isSel = i === this.popupIndex;
        const line = isSel
          ? `${C.AC}▸${C.R} ${C.W}${item.padEnd(popWidth - 2)}${C.R}`
          : `${C.DG} ${C.R}${C.DG}${item.padEnd(popWidth - 2)}${C.R}`;
        popup += `  ${line}\n`;
      }
      popup += "  " + " ".repeat(popWidth) + "\n";
    }

    // Render: popup (above) + box
    process.stdout.write(popup + top + "\n" + middle + "\n" + bot);

    // Position cursor inside the input line, right after the buffer
    // (move up to the middle line, then to the right column)
    const linesUp = 2 + (this.popupOpen ? this.popupItems.length + 1 : 0);  // popup box has extra lines
    // Move cursor to start of input area (after `▸ ` prefix)
    process.stdout.write(ANSI.UP(linesUp));
    process.stdout.write(ANSI.COL(5 + this.cursorPos));
    process.stdout.write(ANSI.SHOW_CURSOR);
  }

  /** Clear the rendered input box + popup. */
  private clear(): void {
    const popupLines = this.popupOpen ? this.popupItems.length + 1 : 0;
    // Move to top of popup (or top of box if no popup), clear down 4 lines (popup+box)
    process.stdout.write(ANSI.UP(popupLines));
    for (let i = 0; i < popupLines + 3; i++) {
      process.stdout.write(ANSI.CLEAR_LINE);
      process.stdout.write(ANSI.DOWN(1));
    }
    process.stdout.write(ANSI.UP(popupLines + 3));
  }

  /** Force re-render from outside (e.g. when status bar info changes). */
  refresh(): void {
    if (this.isRaw) this.render();
  }

  /** Update status bar info without resetting input. */
  setStatusProvider(fn: () => StatusBarInfo): void {
    this.statusFn = fn;
    this.refresh();
  }

  /* ── Keystroke handler ─────────────────────────────────────────────────── */

  private onData = (data: Buffer): void => {
    const s = data.toString("utf-8");
    // Handle multi-byte sequences first (arrows, etc.)
    if (s === "\u001b[A") {  // Up
      if (this.popupOpen && this.popupIndex > 0) {
        this.popupIndex--;
        this.render();
      }
      return;
    }
    if (s === "\u001b[B") {  // Down
      if (this.popupOpen && this.popupIndex < this.popupItems.length - 1) {
        this.popupIndex++;
        this.render();
      }
      return;
    }
    if (s === "\u001b[C") {  // Right
      if (this.cursorPos < this.buffer.length) {
        this.cursorPos++;
        this.render();
      }
      return;
    }
    if (s === "\u001b[D") {  // Left
      if (this.cursorPos > 0) {
        this.cursorPos--;
        this.render();
      }
      return;
    }
    // Map Ctrl-C / Ctrl-D to abort (when buffer empty) or clear (when buffer non-empty)
    if (s === "\u0003" || s === "\u0004") {  // Ctrl-C / Ctrl-D
      if (this.buffer.length === 0) {
        this.stop();
        this.abortHandler();
      } else {
        this.buffer = "";
        this.cursorPos = 0;
        this.popupOpen = false;
        this.render();
      }
      return;
    }
    // Enter submits
    if (s === "\r" || s === "\n") {
      const text = this.buffer;
      this.buffer = "";
      this.cursorPos = 0;
      this.popupOpen = false;
      this.render();
      if (text.trim()) this.submitHandler(text);
      return;
    }
    // Escape closes popup
    if (s === "\u001b") {
      this.popupOpen = false;
      this.render();
      return;
    }
    // Tab completes the highlighted popup item
    if (s === "\t") {
      if (this.popupOpen && this.popupItems[this.popupIndex]) {
        const item = this.popupItems[this.popupIndex];
        const parts = item.split(" ");
        this.buffer = parts[0] + " ";
        this.cursorPos = this.buffer.length;
        this.popupOpen = false;
        this.render();
      }
      return;
    }
    // Backspace
    if (s === "\u007f" || s === "\u0008") {
      if (this.cursorPos > 0) {
        this.buffer = this.buffer.slice(0, this.cursorPos - 1) + this.buffer.slice(this.cursorPos);
        this.cursorPos--;
        this.updatePopup();
        this.render();
      }
      return;
    }
    // Regular printable chars
    if (s >= " " && s.length === 1) {
      this.buffer = this.buffer.slice(0, this.cursorPos) + s + this.buffer.slice(this.cursorPos);
      this.cursorPos++;
      this.updatePopup();
      this.render();
      return;
    }
    // Ignore other control chars / multi-byte sequences
  };

  /** Update popup filter when buffer changes. */
  private updatePopup(): void {
    if (this.buffer.startsWith("/") && this.slashCommands.length > 0) {
      const items = filterSlashCommands(this.buffer.split(" ")[0], this.slashCommands);
      if (items.length > 0) {
        this.popupOpen = true;
        this.popupItems = items;
        this.popupIndex = 0;
      } else {
        this.popupOpen = false;
      }
    } else {
      this.popupOpen = false;
    }
  }

  /** Inject text (e.g. for shell command execution). */
  setText(text: string): void {
    this.buffer = text;
    this.cursorPos = text.length;
    this.render();
  }
}
