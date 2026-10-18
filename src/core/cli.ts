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
 * Print the banner — a clean ASCII box with brand + version + model +
 * provider + workspace. One block of output, no scattered lines.
 *
 * Respects terminal width — pads/truncates lines to fit inside the box.
 */
export function printBanner(model = "", backend = ""): void {
  const inner = Math.max(40, Math.min(TW - 6, 64));
  // Strip ANSI codes when measuring visual width (so colors don't affect padding)
  const visualWidth = (s: string): number => s.replace(/\u001b\[\d+m/g, "").length;
  const pad = (s: string): string => {
    const w = visualWidth(s);
    if (w >= inner) return s;
    return s + " ".repeat(inner - w);
  };

  const brand = `${C.PU}${C.B}AXONIZ${C.R}`;
  const ver = `${C.DG}v${AXONIZ_VERSION_SHORT}${C.R}`;
  const tagline = `${C.DG}local-first AI agent${C.R}`;
  const prov = `${C.CY}${backend || "auto"}${C.R}`;
  const mdl = `${C.GR}${model || "auto"}${C.R}`;

  const bar = BOX.h.repeat(inner + 2);  // +2 for the leading/trailing space inside the box

  const row1 = ` ${brand}  ${ver}  ${C.DG}\u00b7${C.R}  ${tagline}`;
  const row2 = ` ${C.DG}provider${C.R} ${prov}`;
  const row3 = ` ${C.DG}model${C.R}    ${mdl}`;

  console.log();
  console.log(`  ${C.DG}${BOX.stl}${bar}${BOX.str}${C.R}`);
  console.log(`  ${C.DG}${BOX.v}${C.R}${pad(row1)}${C.DG}${BOX.v}${C.R}`);
  console.log(`  ${C.DG}${BOX.v}${C.R}${pad(row2)}${C.DG}${BOX.v}${C.R}`);
  console.log(`  ${C.DG}${BOX.v}${C.R}${pad(row3)}${C.DG}${BOX.v}${C.R}`);
  console.log(`  ${C.DG}${BOX.sbl}${bar}${BOX.sbr}${C.R}`);
  console.log();
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
 * Render a response with fenced-code handling.
 *
 * Code blocks get a rounded box with the language label in the top border.
 * Prose uses inline markdown rendering (bold / italic / `code`).
 * Bullets use ▸ for top-level and ‣ for nested.
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
        flushCode(codeBuf, codeLang);
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

    // Bullet list items (top-level)
    if (/^\s*[-*]\s+/.test(s)) {
      const body = s.replace(/^\s*[-*]\s+/, "").trim();
      console.log(`${prefix}${C.AC}\u25b8${C.R} ${inline(body)}${C.R}`);
      continue;
    }

    // Nested bullets (indent + dash/asterisk)
    if (/^ {2,}[-*]\s+/.test(s)) {
      const body = s.replace(/^\s*[-*]\s+/, "").trim();
      console.log(`${prefix}  ${C.DG}\u2023${C.R} ${inline(body)}${C.R}`);
      continue;
    }

    // Numbered list items
    const num = s.match(/^(\s*)(\d+)\. (.*)/);
    if (num) {
      console.log(`${prefix}${C.AC}${num[2]}.${C.R} ${inline(num[3])}${C.R}`);
      continue;
    }

    console.log(`${prefix}${C.GR}${inline(s)}${C.R}`);
  }

  // Flush an unterminated code block.
  if (inCode && codeBuf.length > 0) flushCode(codeBuf, codeLang);
}

/** Render a fenced code block inside a rounded box with the language label. */
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

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private i = 0;
  private lastText = "";

  constructor(private text = "working", private delay = 80) {}

  start(text?: string): void {
    if (!tty()) return;
    if (text !== undefined) {
      this.text = text;
      this.lastText = text;
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      const f = SPINNER_FRAMES[this.i++ % SPINNER_FRAMES.length];
      const line = `  ${C.AC}${f}${C.R} ${C.DG}${this.text}${C.R}`;
      const pad = " ".repeat(Math.max(0, TW - line.length + 4));
      process.stdout.write(`\r${line}${pad}`.slice(0, TW));
    }, this.delay);
    this.timer.unref?.();
  }

  /** Update the spinner's text without restarting the animation. */
  setText(text: string): void {
    this.text = text;
  }

  stop(finalText?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Clear the spinner line
      process.stdout.write(`\r${" ".repeat(Math.min(TW, 100))}\r`);
      if (finalText) console.log(`  ${finalText}`);
    }
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
  private prompt(): string {
    const cwd = require$basename(this.agent.workspace);
    const modeColor = { agent: C.CY, goal: C.PU, chat: C.DG }[this.mode] ?? C.DG;
    const dot = `${modeColor}\u25c8${C.R}`;
    const mode = `${modeColor}${this.mode}${C.R}`;
    return `\n  ${dot} ${mode} ${C.DG}${cwd}${C.R}${C.DG}\u203a${C.R} `;
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

  private printFooter(): void {
    const elapsed = Math.floor((Date.now() - (this.runStartTime || this.startTime)) / 1000);
    const cfg = this.agent.config as Record<string, unknown>;
    const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
    const prov = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
    const pCfg = llm?.providers?.[prov] ?? {};
    const model = String(pCfg.model_name ?? pCfg.model_path ?? cfg.model_name ?? "?");
    const modelShort = model.split(/[\\/]/).pop()?.replace(/\.(gguf|bin)$/i, "") ?? model;
    const toks = this.tokensOut > 0 ? `${C.GR}${this.tokensOut}${C.R} tokens` : `${C.DG}\u2014${C.R}`;
    const tools = this.toolCalls > 0 ? `${C.AC}${this.toolCalls}${C.R} tools` : "";
    const sep = tools ? `${C.DG}\u00b7${C.R} ` : "";
    console.log(`\n  ${C.DG}${prov}${C.R}${C.DG}/${C.R}${C.DG}${modelShort}${C.R} ${C.DG}\u00b7${C.R} ${toks}${tools ? ` ${C.DG}\u00b7${C.R} ${sep}` : ""}${tools}${tools ? ` ${C.DG}\u00b7${C.R} ` : " "}${C.DG}${elapsed}s${C.R}`);
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

    // Welcome — clean one-liner
    console.log(`  ${C.DG}type${C.R} ${C.AC}/help${C.R} ${C.DG}for commands${C.R} ${C.DG}\u00b7${C.R} ${C.DG}Ctrl-C clears line${C.R} ${C.DG}\u00b7${C.R} ${C.DG}exit to quit${C.R}`);
    if (this.webUrl) console.log(`  ${C.DG}web \u2192${C.R} ${C.BL}${this.webUrl}${C.R}`);
    console.log();

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
