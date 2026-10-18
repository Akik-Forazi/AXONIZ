/**
 * AXONIZ-ZERO — CLI
 * Port of axoniz/core/cli.py (input() REPL -> node:readline/promises).
 *
 * ────────────────────────────────────────────────────────────────────────
 * DESIGN PHILOSOPHY (claude-code / gemini-cli / opencode inspired)
 * ────────────────────────────────────────────────────────────────────────
 *   1. Branded ASCII box banner — single clean frame, no scattered lines.
 *   2. Single-line prompt — `▸ agent ~/dir` not multi-line `\` continuation.
 *   3. Inline token streaming — tokens appear on the same line, no scroll.
 *   4. Tool calls render as one-line status with spinner → checkmark when done.
 *   5. Code blocks use rounded box-drawing (┌─┐│└─┘) with language label.
 *   6. Noise suppression — node-llama-cpp warnings + Ctrl-C reminders filtered.
 *   7. Footer status line — model + tokens + elapsed during streaming.
 *   8. Slash commands render in clean two-column layout.
 *   9. Mode indicator — colored dot before prompt (cyan=agent / purple=goal / gray=chat).
 *  10. Welcome message — one-liner with the most useful commands.
 */
import process from "node:process";
import * as readline from "node:readline/promises";
import { execFile, exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, saveConfig, MODELS_DIR } from "./config.js";
import type { Agent } from "./agent.js";
import { AbortFlag as AbortFlagClass } from "./agent.js";
// New UI primitives — filled-block ASCII art, semantic theme, multi-column
// footer, ⏺ tool indicators, minimal ❯ prompt. Inspired by actual
// gemini-cli + claude-code source code research (see /download/cli-research.md).
import {
  printBanner as cliUiPrintBanner,
  printResponse as cliUiPrintResponse,
  printWelcome as cliUiPrintWelcome,
  printToolCall as cliUiPrintToolCall,
  printToolResult as cliUiPrintToolResult,
  printFooter as cliUiPrintFooter,
  printCodeBlock as cliUiPrintCodeBlock,
  buildPrompt as cliUiBuildPrompt,
  pickLogoByWidth,
  theme,
  compactNumber,
  visualWidth,
  Spinner as CliUiSpinner,
  R as UI_R,
  B as UI_B,
  I as UI_I,
} from "./cli-ui.js";

/* ── Colour helpers ───────────────────────────────────────────────────────── */

function tty(): boolean {
  return Boolean(process.stdout.isTTY);
}

function colorOk(): boolean {
  if (process.env.NO_COLOR) return false;
  return tty() || Boolean(process.env.FORCE_COLOR);
}

export const HAS_COLOR = colorOk();
export const TW = process.stdout.columns || 100;

/** 8-bit color escape sequence — empty when colors are disabled. */
function e(code: string): string {
  return HAS_COLOR ? `\u001b[${code}m` : "";
}

export class C {
  static R = e("0");   // reset
  static B = e("1");   // bold
  static D = e("2");   // dim
  static I = e("3");   // italic
  static W = e("97");  // bright white
  static GR = e("37"); // gray (light)
  static DG = e("90"); // dark gray
  static BL = e("94"); // bright blue
  static GB = e("92"); // bright green
  static YL = e("93"); // bright yellow
  static RD = e("91"); // bright red
  static PU = e("95"); // bright magenta (purple)
  static CY = e("96"); // bright cyan
  static AC = e("94"); // accent (alias to BL)
  static OK = e("92"); // ok green
  static ER = e("91"); // error red
  static WN = e("93"); // warn yellow
  static TH = e("90"); // thought gray
  static TC = e("96"); // tool code cyan
  static TR = e("92"); // tool result green

  // Compatibility aliases used by runner.ts
  static RESET = e("0");
  static BOLD = e("1");
  static GRAY = e("90");
  static DGRAY = e("90");
  static WHITE = e("97");
  static BLUE = e("94");
  static GREEN = e("92");
  static YELLOW = e("93");
  static RED = e("91");
  static CYAN = e("96");
  static PURPLE = e("95");
}

/* ── Box-drawing chars (rounded for code blocks, square for borders) ────── */

const BOX = {
  tl: "\u256d",  // ╭
  tr: "\u256e",  // ╮
  bl: "\u2570",  // ╰
  br: "\u256f",  // ╯
  h:  "\u2500",  // ─
  v:  "\u2502",  // │
  // square variant for outer banner
  stl: "\u250c", // ┌
  str: "\u2510", // ┐
  sbl: "\u2514", // └
  sbr: "\u2518", // ┘
};

/* ── Banner ──────────────────────────────────────────────────────────────── */

/**
 * Print the splash — a big filled-block ASCII brand logo (gemini-cli + claude-code style).
 * One-time on REPL start. Uses pickLogoByWidth() to pick long/short/tiny
 * variant based on terminal width.
 *
 * Old design used hollow characters (___ __ __ ___). New design uses
 * filled blocks (████ ███░░) — same style as gemini-cli's AsciiArt.ts
 * and claude-code's banner. Looks denser, more premium, and renders
 * correctly in all terminals.
 */
export function printSplash(): void {
  const logo = pickLogoByWidth();
  console.log();
  for (const line of logo) {
    console.log(`  ${theme.accent.primary}${line}${UI_R}`);
  }
  console.log(`  ${theme.text.muted}local-first AI agent${UI_R}`);
  console.log();
}

/**
 * Print the banner — delegates to cli-ui.ts which uses:
 *   - Filled-block ASCII art (gemini-cli + claude-code style)
 *   - Multi-size logo variants picked by terminal width
 *   - Brand purple on the filled blocks
 *   - Single-line summary below: version + tagline + provider + model
 */
export function printBanner(model = "", backend = ""): void {
  cliUiPrintBanner(model || "auto", backend, AXONIZ_VERSION_SHORT);
}

// Resolve the version lazily so cli.ts doesn't pull runner.ts into a circular import.
let AXONIZ_VERSION_SHORT = "0.1.8";
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const v = (eval("require") as NodeRequire)((function () {
    // Resolve path relative to this file: <repo>/package.json
    const pathMod = require("node:path");
    const fileURLMod = require("node:url");
    const here = pathMod.dirname(fileURLMod.fileURLToPath(import.meta.url));
    return pathMod.join(here, "..", "..", "package.json");
  })());
  AXONIZ_VERSION_SHORT = (v?.version ?? "0.1.8").replace(/^.*?(\d+\.\d+\.\d+).*$/, "$1");
} catch {
  /* keep default */
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function kv(key: string, val: unknown): void {
  const v = String(val);
  const trunc = v.length > (TW - 24) ? v.slice(0, TW - 24) + "…" : v;
  console.log(`  ${C.DG}${key.padEnd(16)}${C.R} ${C.GR}${trunc}${C.R}`);
}

export function section(title: string): void {
  console.log(`\n  ${C.DG}${C.B}${title.toUpperCase()}${C.R}`);
  console.log(`  ${C.DG}${BOX.h.repeat(Math.min(title.length + 2, TW - 4))}${C.R}`);
}

export function ok(msg: string): void {
  console.log(`  ${C.OK}\u2713${C.R} ${C.GR}${msg}${C.R}`);
}

export function err(msg: string): void {
  console.log(`  ${C.RD}\u2717${C.R} ${C.GR}${msg}${C.R}`);
}

export function warn(msg: string): void {
  console.log(`  ${C.WN}\u26a0${C.R} ${C.GR}${msg}${C.R}`);
}

/* ── Inline markdown rendering (very small subset) ──────────────────────── */

function inline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, `${C.W}${C.B}$1${C.R}${C.GR}`)
    .replace(/\*(.*?)\*/g, `${C.D}$1${C.R}${C.GR}`)
    .replace(/`([^`\n]+)`/g, `${C.PU}$1${C.R}${C.GR}`);
}

/**
 * Render a response with fenced-code + markdown-table handling.
 *
 * Code blocks get a rounded box with the language label in the top border.
 * Markdown tables (lines starting with `|` + a separator row `|---|---|`)
 * render as proper box-drawing tables with aligned columns.
 * Bullets use ▸ for top-level and ‣ for nested.
 */
/**
 * Render a model response — delegates to cli-ui.ts for:
 *   - Filled-box code blocks (rounded corners + language label)
 *   - ▸ top-level bullets + ‣ nested bullets
 *   - Inline markdown (**bold**, *italic*, `code`)
 *   - Numbered lists
 *
 * Markdown tables are still handled here (cli-ui doesn't support them yet)
 * so the model's tabular output renders properly.
 */
export function printResponse(text: string, prefix = "  "): void {
  if (!text) return;

  // Extract any markdown tables first, render them via the legacy table
  // renderer, then hand the rest to cli-ui's printResponse for code blocks
  // + bullets + inline markdown.
  const lines = text.split("\n");
  let inTable = false;
  let tableBuf: string[] = [];
  let beforeTable: string[] = [];
  let afterTable: string[] = [];

  for (const line of lines) {
    const isTableRow = line.trim().startsWith("|") && line.trim().endsWith("|");
    const isTableSep = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

    if (isTableRow && !inTable) {
      // Starting a new table — flush beforeTable to cli-ui
      if (beforeTable.length > 0) {
        cliUiPrintResponse(beforeTable.join("\n"), prefix);
      }
      beforeTable = [];
      inTable = true;
      tableBuf.push(line);
    } else if (inTable && (isTableRow || isTableSep)) {
      tableBuf.push(line);
    } else if (inTable) {
      // End of table — render it
      flushTable(tableBuf, prefix);
      tableBuf = [];
      inTable = false;
      afterTable.push(line);
    } else {
      beforeTable.push(line);
    }
  }

  if (tableBuf.length > 0) {
    flushTable(tableBuf, prefix);
  }

  // Render the non-table content via cli-ui
  const nonTable = (beforeTable.length > 0 ? beforeTable : afterTable);
  if (beforeTable.length > 0 && afterTable.length > 0) {
    // Mixed — render before-table first via cli-ui, then after-table separately
    cliUiPrintResponse(beforeTable.join("\n"), prefix);
    cliUiPrintResponse(afterTable.join("\n"), prefix);
  } else if (nonTable.length > 0) {
    cliUiPrintResponse(nonTable.join("\n"), prefix);
  }
}

/** Render a markdown table with box-drawing borders. Kept from the old
 *  implementation because cli-ui's printResponse doesn't handle tables. */
function flushTable(tableBuf: string[], prefix: string): void {
  if (tableBuf.length < 2) {
    for (const l of tableBuf) console.log(`${prefix}${theme.text.secondary}${l}${UI_R}`);
    return;
  }
  const rows: string[][] = [];
  for (const l of tableBuf) {
    const cells = l.split("|").map((c) => c.trim()).filter((_, i, arr) => {
      return !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[arr.length - 1] === "");
    });
    rows.push(cells);
  }
  let sepIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].every((c) => /^:?-{2,}:?$/.test(c))) {
      sepIndex = i;
      break;
    }
  }
  if (sepIndex < 0) {
    for (const l of tableBuf) console.log(`${prefix}${theme.text.secondary}${l}${UI_R}`);
    return;
  }
  const header = rows[0];
  const dataRows = rows.slice(sepIndex + 1);
  const colCount = header.length;
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const all = [header[c] ?? "", ...dataRows.map((r) => r[c] ?? "")];
    colWidths[c] = Math.max(...all.map((s) => s.length)) + 1;
  }
  let top = `${prefix}${theme.ui.border}\u256d${UI_R}`;
  for (let c = 0; c < colCount; c++) {
    top += `${theme.ui.border}${"\u2500".repeat(colWidths[c] + 2)}${UI_R}${c < colCount - 1 ? `${theme.ui.border}\u252c${UI_R}` : ""}`;
  }
  top += `${theme.ui.border}\u256e${UI_R}`;
  console.log(top);
  let headerRow = `${prefix}${theme.ui.border}\u2502${UI_R}`;
  for (let c = 0; c < colCount; c++) {
    const cell = header[c] ?? "";
    const pad = " ".repeat(colWidths[c] - cell.length + 1);
    headerRow += ` ${theme.text.primary}${UI_B}${cell}${UI_R}${pad}${theme.ui.border}\u2502${UI_R}`;
  }
  console.log(headerRow);
  let headerSep = `${prefix}${theme.ui.border}\u251c${UI_R}`;
  for (let c = 0; c < colCount; c++) {
    headerSep += `${theme.ui.border}${"\u2500".repeat(colWidths[c] + 2)}${UI_R}${c < colCount - 1 ? `${theme.ui.border}\u253c${UI_R}` : ""}`;
  }
  headerSep += `${theme.ui.border}\u2524${UI_R}`;
  console.log(headerSep);
  for (const row of dataRows) {
    let rowStr = `${prefix}${theme.ui.border}\u2502${UI_R}`;
    for (let c = 0; c < colCount; c++) {
      const cell = row[c] ?? "";
      const pad = " ".repeat(colWidths[c] - cell.length + 1);
      rowStr += ` ${theme.text.secondary}${cell}${UI_R}${pad}${theme.ui.border}\u2502${UI_R}`;
    }
    console.log(rowStr);
  }
  let bottom = `${prefix}${theme.ui.border}\u2570${UI_R}`;
  for (let c = 0; c < colCount; c++) {
    bottom += `${theme.ui.border}${"\u2500".repeat(colWidths[c] + 2)}${UI_R}${c < colCount - 1 ? `${theme.ui.border}\u2534${UI_R}` : ""}`;
  }
  bottom += `${theme.ui.border}\u256f${UI_R}`;
  console.log(bottom);
}

function flushCode(buf: string[], lang: string): void {
  const inner = Math.min(TW - 6, 72);
  const label = (lang || "code").toUpperCase();
  const labelStr = ` ${C.TC}${label}${C.R}${C.DG} `;
  const barLen = Math.max(0, inner + 2 - labelStr.length - 10);  // adjust for ANSI codes
  const topLabel = labelStr + C.DG + BOX.h.repeat(barLen) + C.R;
  console.log(`  ${C.DG}${BOX.tl}${BOX.h.repeat(inner + 2)}${C.DG}${BOX.tr}${C.R}`);
  console.log(`  ${C.DG}${BOX.v}${C.R}${topLabel}${C.DG}${BOX.v}${C.R}`);
  for (const c of buf) {
    const line = c.length > inner ? c.slice(0, inner - 1) + "…" : c.padEnd(inner);
    console.log(`  ${C.DG}${BOX.v}${C.R} ${C.TC}${line}${C.R} ${C.DG}${BOX.v}${C.R}`);
  }
  console.log(`  ${C.DG}${BOX.bl}${BOX.h.repeat(inner + 2)}${BOX.br}${C.R}`);
}

export function rule(): void {
  console.log(`  ${C.DG}${BOX.h.repeat(Math.min(TW - 4, 72))}${C.R}`);
}

export const _rule = rule;

/* ── Spinner (claude-code style, no flicker) ────────────────────────────── */

const SPINNER_FRAMES = ["\u2802", "\u2812", "\u2810", "\u2830", "\u2828", "\u2840", "\u2844", "\u2804"]; // braille dots

/**
 * Spinner — delegates to cli-ui's Spinner (braille dots, same as gemini-cli's
 * CliSpinner.tsx). The old version used its own implementation; this delegates
 * to a single source of truth so changes to spinner behavior happen in one place.
 */
export class Spinner {
  private inner: InstanceType<typeof CliUiSpinner>;

  constructor(text = "thinking", delay = 80) {
    this.inner = new CliUiSpinner(text, delay);
  }

  start(text?: string): void {
    if (text !== undefined) this.inner.setText(text);
    this.inner.start();
  }

  setText(text: string): void {
    this.inner.setText(text);
  }

  stop(finalText?: string): void {
    this.inner.stop(finalText);
  }
}

/* ── Slash help ───────────────────────────────────────────────────────────── */

export const SLASH_HELP: Record<string, string> = {
  "/help": "show this help",
  "/mode": "/mode [agent|chat|goal] \u2014 switch mode",
  "/models": "list all available models (local vault + registry + cloud)",
  "/model": "show the current model",
  "/use": "/use [name] \u2014 switch model (interactive picker if no arg)",
  "/providers": "list all supported providers",
  "/provider": "show the active provider",
  "/switch": "/switch <provider> \u2014 switch provider live (kills local model on cloud)",
  "/web": "launch the web dashboard in your browser",
  "/tools": "list available agent tools",
  "/history": "show conversation history for this session",
  "/memory": "show semantic memory",
  "/palace": "/palace [search <q> | wings | status]",
  "/clear": "clear screen",
  "/reset": "clear conversation history",
  "/config": "show active config",
  "/health": "system health report",
  "/metrics": "show prometheus metrics",
  "/tree": "workspace file tree",
  "!<cmd>": "run shell command",
};

/* ── Provider catalog (mirrors web/src/stores/axoniz-store.ts) ─────────────── */

/** All providers the CLI can switch between via /switch. */
export const PROVIDER_CATALOG: Array<{
  id: string;
  name: string;
  category: "local" | "cloud";
  defaultBaseUrl: string;
  needsApiKey: boolean;
}> = [
  { id: "llamacpp", name: "llama.cpp (Direct GGUF)", category: "local", defaultBaseUrl: "http://localhost:8080", needsApiKey: false },
  { id: "llamacpp_server", name: "llama.cpp Server", category: "local", defaultBaseUrl: "http://localhost:8080", needsApiKey: false },
  { id: "lmstudio", name: "LM Studio", category: "local", defaultBaseUrl: "http://localhost:1234/v1", needsApiKey: false },
  { id: "ollama", name: "Ollama", category: "local", defaultBaseUrl: "http://localhost:11434", needsApiKey: false },
  { id: "openai", name: "OpenAI", category: "cloud", defaultBaseUrl: "https://api.openai.com/v1", needsApiKey: true },
  { id: "openrouter", name: "OpenRouter", category: "cloud", defaultBaseUrl: "https://openrouter.ai/api/v1", needsApiKey: true },
  { id: "orca", name: "OrcaRouter", category: "cloud", defaultBaseUrl: "https://api.orcarouter.ai/v1", needsApiKey: true },
  { id: "anthropic", name: "Anthropic", category: "cloud", defaultBaseUrl: "https://api.anthropic.com/v1", needsApiKey: true },
  { id: "gemini", name: "Google Gemini", category: "cloud", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", needsApiKey: true },
  { id: "groq", name: "Groq", category: "cloud", defaultBaseUrl: "https://api.groq.com/openai/v1", needsApiKey: true },
  { id: "together", name: "Together AI", category: "cloud", defaultBaseUrl: "https://api.together.xyz/v1", needsApiKey: true },
  { id: "mistral", name: "Mistral", category: "cloud", defaultBaseUrl: "https://api.mistral.ai/v1", needsApiKey: true },
  { id: "deepseek", name: "DeepSeek", category: "cloud", defaultBaseUrl: "https://api.deepseek.com/v1", needsApiKey: true },
  { id: "fireworks", name: "Fireworks AI", category: "cloud", defaultBaseUrl: "https://api.fireworks.ai/inference/v1", needsApiKey: true },
  { id: "perplexity", name: "Perplexity", category: "cloud", defaultBaseUrl: "https://api.perplexity.ai", needsApiKey: true },
  { id: "custom", name: "Custom OpenAI-compatible", category: "cloud", defaultBaseUrl: "", needsApiKey: true },
];

/* ── CLI ──────────────────────────────────────────────────────────────────── */

export class CLI {
  agent: Agent;
  webUrl: string | null;
  mode: "agent" | "chat" | "goal" = "agent";

  private abort = new AbortFlagClass();
  private toolCalls = 0;
  private tokensOut = 0;
  private startTime = Date.now();
  private runStartTime = 0;
  private spinner: Spinner;
  /** Track the in-flight stream buffer for inline rendering. */
  private streamBuf = "";
  private streaming = false;

  constructor(agent: Agent, webUrl: string | null = null) {
    this.agent = agent;
    this.webUrl = webUrl;
    this.spinner = new Spinner("thinking");
  }

  /* ── Prompt ─────────────────────────────────────────────────────────────── */

  /**
   * Single-line prompt with mode dot + cwd.
   *   `▸ agent ~/axoniz `
   * The `▸` glyph + mode word is colored by mode (cyan=agent, purple=goal, gray=chat).
   * No multi-line continuation — that was the old design that broke visually.
   */
  /**
   * Build the prompt — minimal `● cwd ❯ ` (claude-code style).
   * Colored mode dot:
   *   - agent: cyan (action-oriented)
   *   - goal:  purple (autonomous)
   *   - chat:  gray (passive)
   *
   * Delegates to cli-ui's buildPrompt so all the styling lives in one place.
   */
  private prompt(): string {
    return cliUiBuildPrompt(this.mode, this.agent.workspace);
  }

  /* ── Run agent ──────────────────────────────────────────────────────────── */

  async runAgent(task: string): Promise<string> {
    this.abort.clear();
    this.agent.setAbortEvent(this.abort);
    this.toolCalls = 0;
    this.tokensOut = 0;
    this.runStartTime = Date.now();
    this.streamBuf = "";
    this.streaming = false;

    // Step indicator — silent unless something actually happens
    this.agent.onStep = (s, total) => {
      this.spinner.setText(`step ${s}/${total}`);
    };

    // Thought preview — render as a dim italic line, suppress the spinner
    this.agent.onThought = (content) => {
      const preview = content.trim().replace(/\n/g, " ").slice(0, 120);
      if (preview) {
        this.spinner.stop();
        console.log(`  ${C.TH}${C.I}\u25ce ${preview}${C.R}`);
      }
    };

    // Tool call — one-line status: `▸ tool_name  args`
    this.agent.onToolCall = (name, args) => {
      this.spinner.stop();
      const argsS = Object.entries(args)
        .slice(0, 2)
        .map(([k, v]) => `${C.DG}${k}${C.R}=${C.PU}${String(v).slice(0, 40)}${C.R}`)
        .join(" ");
      console.log(`  ${C.AC}\u25b8${C.R} ${C.TC}${name}${C.R}  ${argsS}`);
      this.toolCalls += 1;
      // Restart the spinner for the next LLM call
      this.spinner.setText(`working`);
    };

    // Tool result — `✓ tool_name` (green) or `✗ tool_name` (red)
    this.agent.onToolResult = (_name, result) => {
      const s = String(result);
      const failed = s.startsWith("[ERROR]");
      const icon = failed ? `${C.RD}\u2717${C.R}` : `${C.OK}\u2713${C.R}`;
      let preview = s.trim().replace(/\n/g, " ").slice(0, 100);
      if (preview.length >= 100) preview += "…";
      console.log(`    ${icon} ${C.D}${preview}${C.R}`);
    };

    // Token stream — inline rendering, accumulate to single line
    this.agent.onToken = (tok) => {
      this.tokensOut += tok.length;
      if (!this.streaming) {
        this.streaming = true;
        this.spinner.stop();
        process.stdout.write(`  ${C.GR}`);
      }
      process.stdout.write(tok);
    };
    this.agent.onDone = () => {
      if (this.streaming) {
        process.stdout.write(C.R);
        this.streaming = false;
      }
    };

    let result: string;
    try {
      this.spinner.start("thinking");
      result = await this.agent.run(task);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        this.abort.set();
        result = "[Stopped by user]";
      } else {
        throw e;
      }
    } finally {
      this.spinner.stop();
      if (this.streaming) {
        process.stdout.write(C.R + "\n");
        this.streaming = false;
      }
    }

    // If the agent didn't stream tokens (e.g. agent mode with tool calls),
    // print the final result as a properly-rendered response.
    if (this.tokensOut === 0) {
      console.log();
      printResponse(result);
    }

    // Footer status line
    this.printFooter();
    return result;
  }

  /** Python-compatible alias. */
  _run_agent(task: string): Promise<string> {
    return this.runAgent(task);
  }

  /* ── Run chat ──────────────────────────────────────────────────────────── */

  async runChat(message: string): Promise<string> {
    this.abort.clear();
    this.agent.setAbortEvent(this.abort);
    this.tokensOut = 0;
    this.runStartTime = Date.now();
    this.streaming = false;

    this.agent.onToken = (t) => {
      this.tokensOut += t.length;
      if (!this.streaming) {
        this.streaming = true;
        process.stdout.write(`  ${C.GR}`);
      }
      process.stdout.write(t);
    };

    let full = "";
    try {
      this.spinner.start("thinking");
      await this.agent.chat(message);
    } catch {
      this.abort.set();
    } finally {
      this.spinner.stop();
      if (this.streaming) {
        process.stdout.write(C.R + "\n");
        this.streaming = false;
      }
    }

    // If no tokens streamed, fall back to printResponse
    if (this.tokensOut === 0) {
      console.log();
      rule();
      printResponse(full);
      rule();
    }
    this.printFooter();
    return full;
  }

  _run_chat(message: string): Promise<string> {
    return this.runChat(message);
  }

  /* ── Run goal ──────────────────────────────────────────────────────────── */

  async runGoal(goal: string): Promise<string> {
    console.log(`\n  ${C.PU}\u25c8${C.R} ${C.PU}goal${C.R} ${C.DG}\u2014 autonomous until complete${C.R}`);
    console.log(`  ${C.DG}goal:${C.R} ${C.GR}${goal}${C.R}\n`);

    const { LoopEngine } = (await import("./loop.js")) as unknown as {
      LoopEngine: new (
        agent: Agent,
        opts: { maxCycles: number; maxRetries: number; verbose?: boolean },
      ) => { runGoal(goal: string): Promise<string> };
    };
    const engine = new LoopEngine(this.agent, {
      maxCycles: Number((this.agent.config as Record<string, unknown>).max_cycles ?? 5),
      maxRetries: 3,
      verbose: true,
    });
    const result = await engine.runGoal(goal);
    console.log();
    ok(result);
    return result;
  }

  _run_goal(goal: string): Promise<string> {
    return this.runGoal(goal);
  }

  /* ── Footer status line ────────────────────────────────────────────────── */

  /**
   * Multi-column footer (gemini-cli Footer.tsx pattern) — model + tokens
   * (compact) + elapsed + cwd + git-branch, with width-fitting that drops
   * low-priority columns + appends `…` when narrow.
   */
  private printFooter(): void {
    const elapsed = Math.floor((Date.now() - (this.runStartTime || this.startTime)) / 1000);
    const cfg = this.agent.config as Record<string, unknown>;
    const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
    const prov = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
    const pCfg = llm?.providers?.[prov] ?? {};
    const model = String(pCfg.model_name ?? pCfg.model_path ?? cfg.model_name ?? "?");
    const modelShort = model.split(/[\\/]/).pop()?.replace(/\.(gguf|bin)$/i, "") ?? model;

    cliUiPrintFooter({
      provider: prov,
      model: modelShort,
      tokens: this.tokensOut > 0 ? this.tokensOut : undefined,
      elapsedSec: elapsed,
      cwd: this.agent.workspace,
      // git-branch + code-changes could be added here with a git rev-parse call
      // but that adds latency to every footer render — skip for now.
    });
  }

  /* ── Slash commands ────────────────────────────────────────────────────── */

  async handleSlash(text: string): Promise<boolean> {
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    try {
      if (cmd === "/help") {
        console.log(`\n  ${C.DG}${C.B}Slash commands${C.R}\n`);
        // Two-column layout — better for wide terminals
        const entries = Object.entries(SLASH_HELP);
        const half = Math.ceil(entries.length / 2);
        const col1 = entries.slice(0, half);
        const col2 = entries.slice(half);
        for (let i = 0; i < half; i++) {
          const left = col1[i];
          const right = col2[i];
          if (!left) break;
          const lCmd = `${C.AC}${left[0].padEnd(20)}${C.R}`;
          const lDesc = `${C.DG}${left[1].slice(0, 30).padEnd(30)}${C.R}`;
          const rCmd = right ? `${C.AC}${right[0].padEnd(20)}${C.R}` : "";
          const rDesc = right ? `${C.DG}${right[1].slice(0, 30)}${C.R}` : "";
          console.log(`  ${lCmd} ${lDesc}  ${rCmd} ${rDesc}`);
        }
        console.log();
        return true;
      }

      if (cmd === "/mode") {
        const next = parts[1]?.toLowerCase();
        if (next === "agent" || next === "chat" || next === "goal") {
          this.mode = next;
          const color = { agent: C.CY, goal: C.PU, chat: C.DG }[this.mode] ?? C.DG;
          console.log(`  ${C.DG}mode${C.R} ${C.DG}\u2192${C.R} ${color}${this.mode}${C.R}`);
        } else {
          const color = { agent: C.CY, goal: C.PU, chat: C.DG }[this.mode] ?? C.DG;
          console.log(`  ${C.DG}current:${C.R} ${color}${this.mode}${C.R}  ${C.DG}options:${C.R} ${C.CY}agent${C.R} ${C.PU}goal${C.R} ${C.DG}chat${C.R}`);
        }
        return true;
      }

      if (cmd === "/memory") {
        const mem = this.agent.memory.all();
        const keys = Object.keys(mem);
        if (keys.length > 0) {
          section("semantic memory");
          for (const k of keys.slice(0, 20)) kv(k, String(mem[k]).slice(0, 72));
        } else {
          console.log(`  ${C.DG}(empty)${C.R}`);
        }
        return true;
      }

      if (cmd === "/palace") {
        const sub = (parts[1] ?? "status").toLowerCase();
        if (sub === "search" && parts.length > 2) {
          const query = parts.slice(2).join(" ");
          const r = (await this.agent.memory.palace.search(query, { limit: 6 })) as {
            results?: Array<{ wing: string; room: string; text: string }>;
          };
          const hits = r.results ?? [];
          if (hits.length > 0) {
            section(`palace: ${query}`);
            for (const h of hits) {
              console.log(
                `  ${C.DG}[${h.wing}/${h.room}]${C.R}  ${C.GR}${h.text.slice(0, 150)}${C.R}`,
              );
            }
          } else {
            console.log(`  ${C.DG}no results${C.R}`);
          }
        } else if (sub === "wings") {
          const wings = (this.agent.memory.palace.list_wings() as { wings?: Record<string, number> })
            .wings ?? {};
          section("palace wings");
          for (const [w, count] of Object.entries(wings)) kv(w, `${count} drawers`);
        } else {
          const st = this.agent.memory.palace.status();
          console.log(`  ${C.DG}palace: ${st.total_drawers ?? 0} drawers${C.R}`);
          for (const [w, count] of Object.entries(st.wings ?? {}).slice(0, 8)) {
            console.log(`    ${C.DG}${w.padEnd(30)}${C.R}${C.GR}${count}${C.R}`);
          }
        }
        return true;
      }

      if (cmd === "/clear") {
        // ANSI clear screen + home
        process.stdout.write("\u001b[2J\u001b[H");
        return true;
      }

      if (cmd === "/reset") {
        this.agent.reset();
        ok("conversation reset");
        return true;
      }

      if (cmd === "/config") {
        const cfg = loadConfig() as unknown as Record<string, unknown>;
        section("config");
        for (const k of [
          "provider",
          "model_name",
          "base_url",
          "temperature",
          "max_tokens",
          "max_steps",
          "workspace",
        ]) {
          if (k in cfg) kv(k, String(cfg[k]));
        }
        return true;
      }

      if (cmd === "/health") {
        const h = await this.agent.health();
        const live = h.status === "ok";
        const dot = live ? `${C.OK}\u25cf${C.R}` : `${C.WN}\u25cf${C.R}`;
        console.log(`\n  ${dot} ${C.DG}${String(h.backend ?? "?")} ${C.DG}/${C.R} ${C.GR}${String(
          h.model ?? (this.agent.config as Record<string, unknown>).model_name ?? "?",
        )}${C.R}\n`);
        try {
          const ist = await this.agent.integrationStatus();
          kv("palace", `${ist.palace_available ? `${C.OK}\u2713${C.R}` : `${C.RD}\u2717${C.R}`}  ${String(ist.palace_drawers ?? 0)} drawers`);
          const kg = ist.kg_stats as Record<string, unknown> | undefined;
          kv("kg triples", String(kg?.total_triples ?? 0));
        } catch {
          /* integrations optional */
        }
        return true;
      }

      if (cmd === "/metrics") {
        const { getMetrics } = await import("./metrics.js");
        console.log(await getMetrics());
        return true;
      }

      if (cmd === "/tree") {
        const result = this.agent.codeTools.tree(this.agent.workspace);
        console.log();
        for (const line of result.split("\n")) console.log(`  ${C.DG}${line}${C.R}`);
        return true;
      }

      /* ── Model + provider commands ──────────────────────────────────── */

      if (cmd === "/model") {
        const cfg = this.agent.config as Record<string, unknown>;
        const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
        const prov = String(
          cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp",
        );
        const pCfg = llm?.providers?.[prov] ?? {};
        const model = String(pCfg.model_name ?? pCfg.model_path ?? cfg.model_name ?? cfg.model_path ?? "(unset)");
        const providerMeta = PROVIDER_CATALOG.find((p) => p.id === prov);
        console.log(`\n  ${C.DG}provider${C.R}  ${C.CY}${prov}${C.R}${providerMeta ? ` ${C.DG}(${providerMeta.name})${C.R}` : ""}`);
        console.log(`  ${C.DG}model${C.R}    ${C.GR}${model}${C.R}`);
        if (pCfg.base_url) console.log(`  ${C.DG}url${C.R}       ${C.DG}${String(pCfg.base_url)}${C.R}`);
        if (pCfg.model_path) {
          const mp = String(pCfg.model_path);
          if (fs.existsSync(mp)) console.log(`  ${C.DG}file${C.R}      ${C.OK}${mp}${C.R}`);
          else console.log(`  ${C.DG}file${C.R}      ${C.RD}${mp} (missing)${C.R}`);
        }
        console.log();
        return true;
      }

      if (cmd === "/models") {
        await this.cmdModels(parts.slice(1));
        return true;
      }

      if (cmd === "/use") {
        await this.cmdUse(parts.slice(1));
        return true;
      }

      if (cmd === "/providers") {
        console.log(`\n  ${C.W}${C.B}Supported providers${C.R}\n`);
        const cfg = this.agent.config as Record<string, unknown>;
        const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
        const active = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
        for (const p of PROVIDER_CATALOG) {
          const isOn = p.id === active;
          const dot = isOn ? `${C.OK}\u25cf${C.R}` : `${C.DG}\u25cb${C.R}`;
          const cat = p.category === "local" ? `${C.CY}local${C.R}` : `${C.PU}cloud${C.R}`;
          const cfg_p = llm?.providers?.[p.id] ?? {};
          const hasKey = Boolean(cfg_p.api_key);
          const keyMark = p.needsApiKey ? (hasKey ? `${C.OK}\u2713${C.R}` : `${C.RD}\u2717${C.R}`) : `${C.DG}-${C.R}`;
          console.log(`  ${dot} ${C.BL}${p.id.padEnd(18)}${C.R} ${cat}  ${keyMark}  ${C.DG}${p.name}${C.R}`);
        }
        console.log(`\n  ${C.DG}\u25cf = active  \u2713 = key set  \u2717 = key missing${C.R}`);
        console.log(`  ${C.DG}switch with: /switch <provider>${C.R}\n`);
        return true;
      }

      if (cmd === "/provider") {
        const cfg = this.agent.config as Record<string, unknown>;
        const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
        const prov = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
        const meta = PROVIDER_CATALOG.find((p) => p.id === prov);
        const pCfg = llm?.providers?.[prov] ?? {};
        console.log(`\n  ${C.DG}active provider${C.R}  ${C.CY}${prov}${C.R}`);
        if (meta) console.log(`  ${C.DG}name${C.R}              ${C.GR}${meta.name}${C.R}  ${C.DG}(${meta.category})${C.R}`);
        if (pCfg.base_url) console.log(`  ${C.DG}base url${C.R}         ${C.DG}${String(pCfg.base_url)}${C.R}`);
        if (meta?.needsApiKey) {
          const hasKey = Boolean(pCfg.api_key);
          console.log(`  ${C.DG}api key${C.R}          ${hasKey ? `${C.OK}\u2713 set${C.R}` : `${C.RD}\u2717 missing${C.R}`}`);
        }
        console.log(`  ${C.DG}switch with${C.R}       ${C.AC}/switch${C.R} ${C.DG}<provider>${C.R}`);
        console.log(`  ${C.DG}list all${C.R}           ${C.AC}/providers${C.R}\n`);
        return true;
      }

      if (cmd === "/switch") {
        await this.cmdSwitch(parts.slice(1));
        return true;
      }

      if (cmd === "/web") {
        await this.cmdLaunchWeb(parts.slice(1));
        return true;
      }

      if (cmd === "/tools") {
        const tools = this.agent.availableTools;
        if (tools.length === 0) {
          console.log(`  ${C.DG}(no tools registered)${C.R}`);
        } else {
          console.log(`\n  ${C.W}${C.B}Available tools${C.R}  ${C.DG}(${tools.length})${C.R}\n`);
          // Two columns for compactness
          const half = Math.ceil(tools.length / 2);
          const col1 = tools.slice(0, half);
          const col2 = tools.slice(half);
          for (let i = 0; i < half; i++) {
            const left = col1[i];
            const right = col2[i];
            if (!left) break;
            const lName = `${C.TC}${left.function.name.padEnd(28)}${C.R}`;
            const lDesc = `${C.DG}${String(left.function.description ?? "").split("\n")[0].slice(0, 30).padEnd(30)}${C.R}`;
            const rName = right ? `${C.TC}${right.function.name.padEnd(28)}${C.R}` : "".padEnd(0);
            const rDesc = right ? `${C.DG}${String(right.function.description ?? "").split("\n")[0].slice(0, 30).padEnd(30)}${C.R}` : "";
            console.log(`  ${lName} ${lDesc}  ${rName} ${rDesc}`);
          }
          console.log();
        }
        return true;
      }

      if (cmd === "/history") {
        const msgs = this.agent.history.getSession();
        if (msgs.length === 0) {
          console.log(`  ${C.DG}(no messages in this session)${C.R}`);
        } else {
          console.log(`\n  ${C.W}${C.B}Session history${C.R}  ${C.DG}(${msgs.length} messages)${C.R}\n`);
          for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            const role = String(m.role ?? "user").toUpperCase();
            const content = String(m.content ?? "");
            const roleColor = role === "USER" ? C.GR : role === "ASSISTANT" ? C.CY : C.DG;
            const preview = content.length > 200 ? content.slice(0, 200) + "…" : content;
            console.log(`  ${C.DG}[${String(i).padStart(2)}]${C.R} ${roleColor}${role.padEnd(10)}${C.R} ${C.DG}${preview.replace(/\n/g, " ")}${C.R}`);
          }
          console.log();
        }
        return true;
      }
    } catch (e) {
      err(`Error handling ${cmd}: ${errMsg(e)}`);
      if (process.env.AXONIZ_DEBUG) console.error(e);
      return true;
    }

    return false;
  }

  _handle_slash(text: string): Promise<boolean> {
    return this.handleSlash(text);
  }

  /* ── Model & provider command implementations ────────────────────────────── */

  /** /models [refresh|<provider>] — list all available models. */
  async cmdModels(args: string[]): Promise<void> {
    const sub = args[0]?.toLowerCase();

    if (sub === "refresh") {
      console.log(`\n  ${C.DG}Refreshing cloud model lists...${C.R}`);
      const cfg = this.agent.config as Record<string, unknown>;
      const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
      const active = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
      const pCfg = llm?.providers?.[active] ?? {};
      const baseUrl = String(pCfg.base_url ?? "");
      const apiKey = String(pCfg.api_key ?? "");
      const meta = PROVIDER_CATALOG.find((p) => p.id === active);
      if (!meta || meta.category !== "cloud") {
        warn("Active provider is not a cloud provider — nothing to refresh.");
        console.log(`  ${C.DG}Use /switch <cloud-provider> first.${C.R}\n`);
        return;
      }
      if (!baseUrl) {
        err(`No base_url configured for ${active}.`);
        return;
      }
      try {
        const url = baseUrl.endsWith("/v1") ? baseUrl + "/models" : baseUrl + "/v1/models";
        const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { data?: Array<{ id: string; context_length?: number }> };
        const models = data.data ?? [];
        if (models.length === 0) {
          warn("Provider returned 0 models.");
          return;
        }
        console.log(`  ${C.OK}\u2713${C.R} ${C.GR}${models.length} models available from ${active}:${C.R}\n`);
        for (const m of models.slice(0, 50)) {
          const ctx = m.context_length ? `  ${C.DG}${Math.round(m.context_length / 1024)}K ctx${C.R}` : "";
          console.log(`    ${C.BL}${m.id}${C.R}${ctx}`);
        }
        if (models.length > 50) console.log(`\n  ${C.DG}\u2026 and ${models.length - 50} more${C.R}`);
        console.log(`\n  ${C.DG}switch with: /use <model-id>${C.R}\n`);
      } catch (e) {
        err(`Failed to fetch models: ${errMsg(e)}`);
      }
      return;
    }

    console.log(`\n  ${C.W}${C.B}Available models${C.R}\n`);

    // Section 1: local vault GGUFs
    const vaultModels = collectGguf(MODELS_DIR);
    if (vaultModels.length > 0) {
      console.log(`  ${C.CY}\u25c8 local vault${C.R}  ${C.DG}(${vaultModels.length} in ${MODELS_DIR})${C.R}`);
      for (const m of vaultModels) {
        const name = path.basename(m);
        let sizeGb = 0;
        try { sizeGb = fs.statSync(m).size / 1024 ** 3; } catch { /* ignore */ }
        console.log(`    ${C.BL}${name}${C.R}  ${C.DG}${sizeGb.toFixed(1)} GB${C.R}`);
      }
      console.log();
    } else {
      console.log(`  ${C.DG}local vault: ${C.RD}(empty)${C.R}${C.DG} \u2014 no .gguf files in ${MODELS_DIR}${C.R}\n`);
    }

    // Section 2: registry of vetted models
    const { REGISTRY } = await import("./models.js");
    console.log(`  ${C.PU}\u25c8 registry${C.R}  ${C.DG}(vetted, downloadable)${C.R}`);
    for (const m of Object.values(REGISTRY)) {
      const rec = m.recommended ? ` ${C.OK}\u2605${C.R}` : "";
      console.log(`    ${C.BL}${m.name}${rec}${C.R}  ${C.DG}${m.size_gb}GB ${m.speed_toks}${C.R}  ${C.DG}${m.tags.slice(0, 3).join(", ")}${C.R}`);
    }
    console.log();

    // Section 3: active cloud provider's models
    const cfg = this.agent.config as Record<string, unknown>;
    const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
    const active = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
    const meta = PROVIDER_CATALOG.find((p) => p.id === active);
    if (meta?.category === "cloud") {
      const pCfg = llm?.providers?.[active] ?? {};
      const hasKey = Boolean(pCfg.api_key);
      console.log(`  ${C.PU}\u25c8 cloud${C.R}  ${C.DG}(${active} \u2014 ${meta.name})${C.R}`);
      if (!hasKey && meta.needsApiKey) {
        console.log(`    ${C.RD}\u2717 api key not set${C.R} ${C.DG}\u2014 run /config set llm.providers.${active}.api_key=<key>${C.R}`);
      } else {
        console.log(`    ${C.DG}\u25b8 run /models refresh to fetch the live list${C.R}`);
      }
      console.log();
    }

    console.log(`  ${C.DG}switch:${C.R} ${C.AC}/use <name>${C.R}  ${C.DG}\u00b7${C.R}  ${C.DG}refresh:${C.R} ${C.AC}/models refresh${C.R}\n`);
  }

  /** /use [name] — switch model. If no arg, show interactive picker. */
  async cmdUse(args: string[]): Promise<void> {
    const name = args.join(" ").trim();
    if (name) {
      this.applyModelSwitch(name);
      return;
    }

    const vaultModels = collectGguf(MODELS_DIR);
    const { REGISTRY } = await import("./models.js");
    const registryNames = Object.keys(REGISTRY);

    if (vaultModels.length === 0 && registryNames.length === 0) {
      warn(`No models available. Place .gguf files in ${MODELS_DIR}`);
      console.log(`  ${C.DG}or download a registry model with: axoniz model download <name>${C.R}\n`);
      return;
    }

    console.log(`\n  ${C.W}${C.B}Select a model${C.R}\n`);

    const options: Array<{ label: string; value: string; kind: string; size?: string }> = [];
    let i = 1;
    if (vaultModels.length > 0) {
      console.log(`  ${C.CY}\u25c8 local vault${C.R}`);
      for (const m of vaultModels) {
        const base = path.basename(m);
        let sizeGb = 0;
        try { sizeGb = fs.statSync(m).size / 1024 ** 3; } catch { /* ignore */ }
        const sizeStr = sizeGb > 0 ? `${sizeGb.toFixed(1)}GB` : "";
        console.log(`    ${C.AC}[${i}]${C.R} ${C.GR}${base.padEnd(50)}${C.R} ${C.DG}${sizeStr}${C.R}`);
        options.push({ label: base, value: m, kind: "vault", size: sizeStr });
        i++;
      }
      console.log();
    }

    if (registryNames.length > 0) {
      console.log(`  ${C.PU}\u25c8 registry${C.R}`);
      for (const n of registryNames) {
        const m = REGISTRY[n];
        const rec = m.recommended ? ` ${C.OK}\u2605${C.R}` : "";
        console.log(`    ${C.AC}[${i}]${C.R} ${C.GR}${n.padEnd(50)}${C.R} ${C.DG}${m.size_gb}GB${C.R}${rec}`);
        options.push({ label: n, value: n, kind: "registry", size: `${m.size_gb}GB` });
        i++;
      }
      console.log();
    }

    if (!process.stdin.isTTY) {
      console.log(`  ${C.DG}Non-interactive terminal \u2014 use: /use <name-or-path>${C.R}\n`);
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const choice = (await rl.question(`  ${C.CY}\u25b8 Selection (number or name): ${C.R}`)).trim();
      if (!choice) return;
      if (/^\d+$/.test(choice)) {
        const idx = Number(choice) - 1;
        if (idx < 0 || idx >= options.length) {
          err("Invalid selection.");
          return;
        }
        this.applyModelSwitch(options[idx].value);
        return;
      }
      const match = options.find((o) => o.label === choice || o.value === choice);
      if (match) {
        this.applyModelSwitch(match.value);
        return;
      }
      this.applyModelSwitch(choice);
    } finally {
      rl.close();
    }
  }

  /** Apply a model switch — writes config + calls agent.switchModel/switchBackend. */
  private applyModelSwitch(value: string): void {
    const cfg = loadConfig() as unknown as Record<string, unknown>;
    const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
    const prov = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");

    const isPath = value.includes(path.sep) || value.toLowerCase().endsWith(".gguf");
    let resolvedPath = value;
    if (isPath && !path.isAbsolute(value)) {
      resolvedPath = path.resolve(value);
    }
    if (isPath && !fs.existsSync(resolvedPath)) {
      err(`Model file not found: ${resolvedPath}`);
      return;
    }

    if (!llm) (cfg as Record<string, unknown>).llm = { active_provider: prov, providers: {} };
    if (!llm?.providers) (cfg.llm as Record<string, unknown>).providers = {};
    const providers = (cfg.llm as Record<string, unknown>).providers as Record<string, Record<string, unknown>>;
    if (!providers[prov]) providers[prov] = {};
    if (isPath) {
      providers[prov].model_path = resolvedPath;
      providers[prov].model_name = path.basename(resolvedPath);
    } else {
      providers[prov].model_name = value;
    }
    saveConfig(cfg);

    if (isPath) {
      this.agent.switchModel(path.basename(resolvedPath));
      const agentCfg = this.agent.config as Record<string, unknown>;
      const agentLlm = agentCfg.llm as Record<string, unknown> | undefined;
      const agentProv = (agentLlm?.providers as Record<string, Record<string, unknown>> | undefined)?.[prov];
      if (agentProv) agentProv.model_path = resolvedPath;
      agentCfg.model_path = resolvedPath;
      agentCfg.model_name = path.basename(resolvedPath);
      this.agent.rebuildLlmPublic();
    } else {
      this.agent.switchModel(value);
    }

    ok(`Switched to ${path.basename(resolvedPath)}`);
    console.log(`  ${C.DG}Config saved. Next message will use the new model.${C.R}`);
  }

  /** /switch <provider> — switch provider live, killing local model on cloud. */
  async cmdSwitch(args: string[]): Promise<void> {
    const target = args[0]?.toLowerCase();
    if (!target) {
      console.log(`  ${C.DG}usage:${C.R} ${C.AC}/switch${C.R} ${C.DG}<provider>${C.R}`);
      console.log(`  ${C.DG}run${C.R} ${C.AC}/providers${C.R} ${C.DG}to see the list.${C.R}\n`);
      return;
    }

    const meta = PROVIDER_CATALOG.find((p) => p.id === target);
    if (!meta) {
      err(`Unknown provider: ${target}`);
      console.log(`  ${C.DG}valid providers:${C.R} ${C.BL}${PROVIDER_CATALOG.map((p) => p.id).join(", ")}${C.R}\n`);
      return;
    }

    const cfg = loadConfig() as unknown as Record<string, unknown>;
    const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
    if (!llm) (cfg as Record<string, unknown>).llm = { active_provider: target, providers: {} };
    if (!llm?.providers) (cfg.llm as Record<string, unknown>).providers = {};
    const providers = (cfg.llm as Record<string, unknown>).providers as Record<string, Record<string, unknown>>;
    if (!providers[target]) providers[target] = {};

    if (meta.needsApiKey && !providers[target].api_key) {
      const envKey = `${target.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
      const envVal = process.env[envKey] ?? process.env[`${target}_API_KEY`];
      if (envVal) {
        providers[target].api_key = envVal;
      } else {
        err(`${target} requires an API key.`);
        console.log(`  ${C.DG}set it with:${C.R} ${C.AC}/config set llm.providers.${target}.api_key=<key>${C.R}`);
        console.log(`  ${C.DG}or env var:${C.R}    ${C.BL}${envKey}=<key>${C.R}\n`);
        return;
      }
    }

    if (!providers[target].base_url && meta.defaultBaseUrl) {
      providers[target].base_url = meta.defaultBaseUrl;
    }

    (cfg.llm as Record<string, unknown>).active_provider = target;
    cfg.provider = target;
    cfg.backend = target;

    const isCloud = meta.category === "cloud";
    if (isCloud) {
      cfg.daemon = { ...(cfg.daemon as Record<string, unknown> ?? {}), enabled: false };
      cfg.awareness = { enabled: false };
    } else {
      const daemon = cfg.daemon as Record<string, unknown> | undefined;
      if (daemon && daemon.enabled === false) daemon.enabled = true;
    }

    saveConfig(cfg);

    if (isCloud) {
      this.spinner.start("killing local llama-server");
      const killCmd = process.platform === "win32"
        ? 'taskkill /f /im llama-server.exe 2>nul & taskkill /f /im llama-cli.exe 2>nul & taskkill /f /im main.exe 2>nul'
        : 'pkill -f "llama.*server" 2>/dev/null; pkill -f "llama-cli" 2>/dev/null; true';
      await new Promise<void>((resolve) => {
        exec(killCmd, () => resolve());
      });
      this.spinner.stop();
      ok("Local model killed");
    }

    const agentCfg = this.agent.config as Record<string, unknown>;
    Object.assign(agentCfg, cfg);
    this.agent.switchBackend(target);

    ok(`Switched to ${target}${isCloud ? " (cloud \u2014 daemon disabled)" : " (local)"}`);
    console.log(`  ${C.DG}config saved \u2014 next message will use ${target}.${C.R}`);
    if (meta.needsApiKey && !providers[target].model_name) {
      warn(`No model_name set for ${target}. Set with: /use <model-id>`);
    }
    console.log();
  }

  /** /web [port] — launch the web dashboard. */
  async cmdLaunchWeb(args: string[]): Promise<void> {
    const portArg = Number(args[0]);
    const port = Number.isFinite(portArg) && portArg > 0 && portArg < 65536 ? portArg : 7860;
    console.log(`\n  ${C.DG}Launching web dashboard on port ${port}...${C.R}`);

    try {
      const { spawnWebOnPort, checkCliAvailable } = await import("../web/web-spawn.js");
      const check = checkCliAvailable();
      if (!check.ok) {
        err(`Cannot launch web: ${check.message}`);
        return;
      }
      if (check.stale) {
        warn(check.message);
      }
      const result = await spawnWebOnPort(port);
      if (!result) {
        err("Failed to launch web dashboard.");
        return;
      }
      ok(result.url);
      console.log(`  ${C.DG}opening in your browser...${C.R}\n`);
      try {
        const { openInBrowser } = await import("../web/open_browser.js");
        await openInBrowser(result.url);
      } catch { /* openInBrowser is optional */ }
      if (result.child) {
        result.child.on("exit", (code) => {
          console.log(`  ${C.DG}web dashboard exited (code=${code}).${C.R}`);
        });
      }
    } catch (e) {
      err(`Failed to launch web: ${errMsg(e)}`);
      if (process.env.AXONIZ_DEBUG) console.error(e);
    }
  }

  /* ── Environment check ─────────────────────────────────────────────────── */

  /** Verify essential dependencies. */
  async checkEnvironment(): Promise<boolean> {
    const errors: string[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        execFile("node", ["-v"], (e) => (e ? reject(e) : resolve()));
      });
    } catch {
      errors.push("node.js not found in PATH");
    }

    if (errors.length > 0) {
      console.log(`  ${C.RD}\u2717 Environment checks failed:${C.R}`);
      for (const x of errors) console.log(`    ${C.GR}- ${x}${C.R}`);
      return false;
    }
    return true;
  }

  check_environment(): Promise<boolean> {
    return this.checkEnvironment();
  }

  /* ── Update check (background) ──────────────────────────────────────────── */

  /**
   * Background check against npm registry. If a newer version of
   * @fraziym/axoniz exists, prints a banner update notification
   * (Command-Code style) at the top of the REPL.
   */
  private async checkForUpdate(): Promise<void> {
    try {
      const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name: string; version: string };
      const res = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const latest = (await res.json()) as { version?: string };
      if (latest.version && latest.version !== pkg.version) {
        console.log(`  ${C.DG}${BOX.tl}${"─".repeat(60)}${BOX.tr}${C.R}`);
        console.log(`  ${C.DG}${BOX.v}${C.R} ${C.WN}\u26a1 Update available${C.R} ${C.GR}${pkg.version}${C.R} ${C.DG}\u2192${C.R} ${C.OK}${latest.version}${C.R}${" ".repeat(Math.max(0, 60 - 30 - pkg.version.length - latest.version.length))}${C.DG}${BOX.v}${C.R}`);
        console.log(`  ${C.DG}${BOX.v}${C.R} ${C.DG}run${C.R} ${C.BL}npm install -g ${pkg.name}@latest${C.R}${" ".repeat(Math.max(0, 60 - 10 - pkg.name.length - 8))}${C.DG}${BOX.v}${C.R}`);
        console.log(`  ${C.DG}${BOX.bl}${"─".repeat(60)}${BOX.br}${C.R}`);
        console.log();
      }
    } catch {
      /* network blocked — silent */
    }
  }

  /* ── REPL ──────────────────────────────────────────────────────────────── */

  async run(): Promise<void> {
    if (!process.stdin.isTTY) {
      await this.runPiped();
      return;
    }

    if (!(await this.checkEnvironment())) {
      console.log(`\n  ${C.RD}Essential environment checks failed.${C.R}\n`);
      return;
    }

    // ── Big ASCII splash (one-time) ──
    printSplash();

    // ── Update check (background, won't block REPL) ──
    void this.checkForUpdate();

    // Welcome — clean one-liner (delegates to cli-ui's printWelcome)
    cliUiPrintWelcome(this.webUrl ?? undefined);

    // Show the last diary entry, if the palace has one.
    try {
      const d = this.agent.memory._t_diary_read(1);
      if (d && !d.includes("No diary")) {
        const first = d.split("\n").filter((l: string) => l.trim())[1];
        if (first) console.log(`  ${C.DG}last session:${C.R} ${C.GR}${first.trim().slice(0, 80)}${C.R}\n`);
      }
    } catch {
      /* diary optional */
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    /**
     * Ctrl-C handling — clear the current line silently (no spam message).
     * The previous design printed "(Ctrl-C — type exit to quit)" after every
     * Ctrl-C which cluttered the terminal. Now: just clear + new prompt.
     */
    rl.on("SIGINT", () => {
      // Clear the current line + move cursor home
      process.stdout.write("\r" + " ".repeat(Math.min(TW, 100)) + "\r");
      rl.prompt();
    });

    try {
      for (;;) {
        let text: string;
        try {
          text = (await rl.question(this.prompt())).trim();
        } catch {
          break; // EOF / stdin closed
        }

        if (!text) continue;
        const low = text.toLowerCase().trim();

        if (["exit", "quit", "q", ":q"].includes(low)) {
          console.log(`\n  ${C.DG}bye.${C.R}\n`);
          break;
        }

        if (text.startsWith("!")) {
          try {
            const out = await this.agent.shellTools.run(text.slice(1).trim());
            console.log();
            for (const line of out.split("\n")) console.log(`  ${C.DG}${line}${C.R}`);
          } catch (e) {
            err(errMsg(e));
          }
          continue;
        }

        if (low === "agent" || low === "chat" || low === "goal") {
          this.mode = low;
          const color = { agent: C.CY, goal: C.PU, chat: C.DG }[this.mode] ?? C.DG;
          console.log(`  ${C.DG}mode${C.R} ${C.DG}\u2192${C.R} ${color}${this.mode}${C.R}`);
          continue;
        }

        if (text.startsWith("/")) {
          try {
            if (!(await this.handleSlash(text))) {
              err(`unknown command: ${text.split(/\s+/)[0]}  ${C.DG}(try /help)${C.R}`);
            }
          } catch (e) {
            err(errMsg(e));
          }
          continue;
        }

        try {
          if (this.mode === "goal") await this.runGoal(text);
          else if (this.mode === "chat") await this.runChat(text);
          else await this.runAgent(text);
        } catch (e) {
          err(errMsg(e));
          if (process.env.AXONIZ_DEBUG) console.error(e);
        }
      }
    } finally {
      rl.close();
    }
  }

  /** Non-interactive fallback: one task per line until stdin ends. */
  private async runPiped(): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8").trim();
    if (!text) return;

    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || ["exit", "quit", "q"].includes(t.toLowerCase())) continue;
      if (t.startsWith("/")) {
        await this.handleSlash(t);
        continue;
      }
      try {
        await this.runAgent(t);
      } catch (e) {
        err(errMsg(e));
      }
    }
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Local basename helper (avoids importing node:path just for this). */
function require$basename(p: string): string {
  const norm = p.replace(/[\\/]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** Recursively collect .gguf files under a directory. Max depth 6 to keep it snappy. */
function collectGguf(dir: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 6) return acc;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectGguf(full, acc, depth + 1);
    else if (e.name.toLowerCase().endsWith(".gguf")) acc.push(full);
  }
  return acc;
}
