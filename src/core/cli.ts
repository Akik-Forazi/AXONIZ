/**
 * AXONIZ-ZERO — CLI
 * Port of axoniz/core/cli.py (input() REPL -> node:readline/promises).
 */
import process from "node:process";import * as readline from "node:readline/promises";
import { execFile } from "node:child_process";
import { loadConfig } from "./config.js";
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

function e(code: string): string {
  return HAS_COLOR ? `\u001b[${code}m` : "";
}

export class C {
  static R = e("0");
  static B = e("1");
  static D = e("2");
  static W = e("97");
  static GR = e("37");
  static DG = e("90");
  static BL = e("94");
  static GB = e("92");
  static YL = e("93");
  static RD = e("91");
  static PU = e("35");
  static CY = e("96");
  static AC = e("94");
  static OK = e("92");
  static ER = e("91");
  static WN = e("93");
  static TH = e("90");
  static TC = e("96");
  static TR = e("92");

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
  static PURPLE = e("35");
}

export function printBanner(model = "", backend = ""): void {
  console.log(
    `\n  ${C.W}${C.B}AXONIZ-ZERO${C.R}  ${C.DG}local ai agent \u00b7 ${backend} \u00b7 ${model || "auto"}${C.R}\n`,
  );
}

export function kv(key: string, val: unknown): void {
  console.log(`  ${C.DG}${key.padEnd(18)}${C.R}${C.GR}${String(val)}${C.R}`);
}

export function section(title: string): void {
  console.log(
    `\n  ${C.DG}${title.toUpperCase()}${C.R}\n  ${C.DG}${"-".repeat(Math.min(title.length + 4, 60))}${C.R}`,
  );
}

export function ok(msg: string): void {
  console.log(`  ${C.OK}[+]${C.R}  ${C.DG}${msg}${C.R}`);
}

export function err(msg: string): void {
  console.log(`  ${C.ER}[-]${C.R}  ${C.GR}${msg}${C.R}`);
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, `${C.W}$1${C.R}${C.GR}`)
    .replace(/\*(.*?)\*/g, `${C.D}$1${C.R}${C.GR}`)
    .replace(/`([^`\n]+)`/g, `${C.PU}$1${C.R}${C.GR}`);
}

/** Render a response with fenced-code handling, mirroring the Python renderer. */
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
        const w = Math.min(TW - 8, 72);
        const label = (codeLang || "code").toUpperCase();
        const bar = "-".repeat(Math.max(0, w - label.length - 3));
        console.log(`  ${C.DG}+-- ${C.TC}${label}${C.DG} ${bar}${C.R}`);
        for (const c of codeBuf) console.log(`  ${C.DG}|${C.R} ${C.TR}${c}${C.R}`);
        console.log(`  ${C.DG}+${"-".repeat(Math.max(0, w - 2))}${C.R}`);
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

    // Bullet list items
    if (/^\s*[-*]\s+/.test(s)) {
      const body = s.replace(/^\s*[-*]\s+/, "").trim();
      console.log(`${prefix}${C.GR}\u2022 ${inline(body)}${C.R}`);
      continue;
    }

    // Numbered list items
    const num = s.match(/^(\s*)(\d+)\. (.*)/);
    if (num) {
      console.log(`${prefix}${C.GR}${num[2]}. ${inline(num[3])}${C.R}`);
      continue;
    }

    console.log(`${prefix}${C.GR}${inline(s)}${C.R}`);
  }

  // Flush an unterminated code block.
  if (inCode && codeBuf.length > 0) {
    for (const c of codeBuf) console.log(`  ${C.DG}|${C.R} ${C.TR}${c}${C.R}`);
  }
}

export function rule(): void {
  console.log(`  ${C.DG}${"\u2500".repeat(Math.min(TW - 4, 72))}${C.R}`);
}

export const _rule = rule;

/* ── Spinner ──────────────────────────────────────────────────────────────── */

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frames = ["|", "/", "-", "\\"];
  private i = 0;

  constructor(
    private text = "working...",
    private delay = 100,
  ) {}

  start(): void {
    if (!tty() || this.timer) return;
    this.timer = setInterval(() => {
      const f = this.frames[this.i++ % this.frames.length];
      process.stdout.write(`\r  ${C.DG}${f} ${this.text}${C.R}   `);
    }, this.delay);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write(`\r${" ".repeat(Math.min(TW, 80))}\r`);
    }
  }
}

/* ── Slash help ───────────────────────────────────────────────────────────── */

export const SLASH_HELP: Record<string, string> = {
  "/help": "show this help",
  "/mode": "/mode [agent|chat|goal] \u2014 switch mode",
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

/* ── CLI ──────────────────────────────────────────────────────────────────── */

export class CLI {
  agent: Agent;
  webUrl: string | null;
  mode: "agent" | "chat" | "goal" = "agent";

  private abort = new AbortFlagClass();
  private toolCalls = 0;
  private tokensOut = 0;
  private startTime = Date.now();

  constructor(agent: Agent, webUrl: string | null = null) {
    this.agent = agent;
    this.webUrl = webUrl;
  }

  private prompt(): string {
    const cwd = require$basename(this.agent.workspace);
    const modeColor = { agent: C.BL, goal: C.PU, chat: C.DG }[this.mode] ?? C.DG;
    return (
      `\n  ${C.DG}/ ${C.R}${C.GR}${cwd}${C.R}` +
      `  ${C.DG}[${modeColor}${this.mode}${C.DG}]${C.R}\n` +
      `  ${C.DG}\\ ${C.R}`
    );
  }

  /* ── Run agent ─────────────────────────────────────────────────────────── */

  async runAgent(task: string): Promise<string> {
    this.abort.clear();
    this.agent.setAbortEvent(this.abort);

    this.agent.onStep = (s, total) => {
      if (tty()) process.stdout.write(`\r  ${C.DG}step ${s}/${total}\u2026${C.R}   `);
    };

    this.agent.onThought = (content) => {
      const preview = content.trim().replace(/\n/g, " ").slice(0, 100);
      if (tty()) process.stdout.write(`\r${" ".repeat(Math.min(TW, 80))}\r`);
      console.log(`  ${C.TH}*  ${preview}${C.R}`);
    };

    this.agent.onToolCall = (name, args) => {
      if (tty()) process.stdout.write(`\r${" ".repeat(Math.min(TW, 80))}\r`);
      const argsS = Object.entries(args)
        .slice(0, 2)
        .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
        .join(" ");
      console.log(`\n  ${C.BL}o${C.R}  ${C.TC}${name}${C.R}  ${C.DG}${argsS}${C.R}`);
      this.toolCalls += 1;
    };

    this.agent.onToolResult = (name, result) => {
      void name;
      const s = String(result);
      const failed = s.startsWith("[ERROR]");
      const icon = failed ? `${C.ER}[-]${C.R}` : `${C.OK}[+]${C.R}`;
      let preview = s.trim().replace(/\n/g, " ").slice(0, 110);
      if (preview.length >= 110) preview += "...";
      console.log(`  ${icon}  ${C.TR}${preview}${C.R}`);
    };

    this.agent.onToken = (tok) => {
      this.tokensOut += tok.length;
    };
    this.agent.onDone = null;

    let result: string;
    try {
      result = await this.agent.run(task);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        this.abort.set();
        result = "[Stopped by user]";
      } else {
        throw e;
      }
    } finally {
      if (tty()) process.stdout.write(`\r${" ".repeat(Math.min(TW, 80))}\r`);
    }

    console.log();
    rule();
    printResponse(result);
    rule();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    console.log(`  ${C.DG}${this.toolCalls} tools  ${this.tokensOut} tokens  ${elapsed}s${C.R}`);
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
    const buf: string[] = [];
    this.agent.onToken = (t) => buf.push(t);
    try {
      await this.agent.chat(message);
    } catch {
      this.abort.set();
    }
    const full = buf.join("");
    console.log();
    rule();
    printResponse(full);
    rule();
    return full;
  }

  _run_chat(message: string): Promise<string> {
    return this.runChat(message);
  }

  /* ── Run goal ──────────────────────────────────────────────────────────── */

  async runGoal(goal: string): Promise<string> {
    console.log(`\n  ${C.PU}* ${C.R}  ${C.DG}goal mode - autonomous until complete${C.R}`);
    console.log(`  ${C.DG}goal: ${C.GR}${goal}${C.R}\n`);

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
    console.log(`  ${C.OK}* ${C.R}  ${C.GR}${result}${C.R}`);
    return result;
  }

  _run_goal(goal: string): Promise<string> {
    return this.runGoal(goal);
  }

  /* ── Slash commands ────────────────────────────────────────────────────── */

  async handleSlash(text: string): Promise<boolean> {
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    try {
      if (cmd === "/help") {
        console.log(`\n  ${C.DG}Slash commands:${C.R}`);
        for (const [c, d] of Object.entries(SLASH_HELP)) {
          console.log(`  ${C.BL}${c.padEnd(28)}${C.R}${C.DG}${d}${C.R}`);
        }
        console.log();
        return true;
      }

      if (cmd === "/mode") {
        const next = parts[1]?.toLowerCase();
        if (next === "agent" || next === "chat" || next === "goal") {
          this.mode = next;
          console.log(`  ${C.DG}mode \u2192 ${C.BL}${this.mode}${C.R}`);
        } else {
          console.log(`  ${C.DG}current: ${C.BL}${this.mode}${C.R}  options: agent chat goal`);
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
        // ANSI clear screen + home (works cross-platform, unlike cls/clear exec).
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
        const dot = live ? C.OK : C.ER;
        console.log(
          `  ${dot}[*]${C.R}  ${C.DG}${String(h.backend ?? "?")} / ${String(
            h.model ?? (this.agent.config as Record<string, unknown>).model_name ?? "?",
          )}${C.R}`,
        );
        try {
          const ist = await this.agent.integrationStatus();
          kv(
            "palace",
            `${ist.palace_available ? "[+]" : "[-]"}  ${String(ist.palace_drawers ?? 0)} drawers`,
          );
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
      console.log(`  ${C.ER}[!] Environment checks failed:${C.R}`);
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
    // A REPL needs a TTY; without one, fall back to reading stdin to EOF.
    if (!process.stdin.isTTY) {
      await this.runPiped();
      return;
    }

    if (!(await this.checkEnvironment())) {
      console.log(`\n  ${C.ER}Essential environment checks failed. Please fix before proceeding.${C.R}\n`);
      return;
    }

    console.log(`  ${C.DG}type /help | Ctrl-C stops | exit to quit${C.R}`);
    if (this.webUrl) console.log(`  ${C.DG}web -> ${C.BL}${this.webUrl}${C.R}`);
    console.log();

    // Show the last diary entry, if the palace has one.
    try {
      const d = this.agent.memory._t_diary_read(1);
      if (d && !d.includes("No diary")) {
        const first = d.split("\n").filter((l: string) => l.trim())[1];
        if (first) console.log(`  ${C.DG}Last session: ${C.GR}${first.trim().slice(0, 80)}${C.R}\n`);
      }
    } catch {
      /* diary optional */
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Ctrl-C should clear the line rather than kill the process.
    rl.on("SIGINT", () => {
      console.log(`\n  ${C.DG}(Ctrl-C \u2014 type exit to quit)${C.R}`);
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
          console.log(`  ${C.DG}mode \u2192 ${C.BL}${this.mode}${C.R}`);
          continue;
        }

        if (text.startsWith("/")) {
          try {
            if (!(await this.handleSlash(text))) {
              err(`unknown command: ${text.split(/\s+/)[0]}  (try /help)`);
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
