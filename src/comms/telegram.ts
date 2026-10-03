/**
 * axoniz/comms/telegram.ts
 * =========================
 * FRAZIYM AI Telegram bot — remote control + approval delivery.
 *
 * Setup:
 *   1. Create a bot via @BotFather, get the token
 *   2. Set AXONIZ_TELEGRAM_TOKEN / AXONIZ_TELEGRAM_CHAT_ID, or put them in
 *      ~/.axoniz/config.json under `telegram: { token, chat_id }`
 *
 * Port of axoniz/comms/telegram.py (python-telegram-bot / raw HTTP -> grammy).
 *
 * Commands:
 *   /ask [task]       — run a task in background
 *   /status           — system status
 *   /approve [id]     — approve a pending authority gate
 *   /deny [id]        — deny a pending authority gate
 *   /pause            — emergency pause all actions
 *   /resume           — resume after pause
 *   /goals            — show active goals
 *   /audit            — recent audit log
 *   /help             — command list
 */
import process from "node:process";
import { loadConfig } from "../core/config.js";
import { debug, info } from "../core/debug.js";

type AgentCallback = (task: string) => string | Promise<string>;
type ApprovalCallback = (decisionId: string, approved: boolean) => void;

/** Minimal structural type for grammy's Bot, kept local so the dep stays optional. */
interface GrammyBot {
  api: { sendMessage(chatId: string, text: string, extra?: Record<string, unknown>): Promise<unknown> };
  command(cmd: string, handler: (ctx: GrammyContext) => unknown): void;
  on(filter: string, handler: (ctx: GrammyContext) => unknown): void;
  start(opts?: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
}
interface GrammyContext {
  message?: { text?: string; chat?: { id?: number | string } };
  reply(text: string, extra?: Record<string, unknown>): Promise<unknown>;
}

/**
 * FRAZIYM AI's Telegram interface.
 * Runs in the background; the agent can call sendMessage() at any time.
 */
export class AxonizTelegramBot {
  token: string;
  chatId: string;

  private bot: GrammyBot | null = null;
  private agentCallback: AgentCallback | null = null;
  private approvalCallback: ApprovalCallback | null = null;
  private running = false;

  constructor(token?: string | null, chatId?: string | null) {
    this.token = token || process.env.AXONIZ_TELEGRAM_TOKEN || "";
    this.chatId = chatId || process.env.AXONIZ_TELEGRAM_CHAT_ID || "";
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.chatId);
  }

  is_configured(): boolean {
    return this.isConfigured();
  }

  /** Called when the user sends /ask. cb(task) -> result string. */
  setAgentCallback(cb: AgentCallback): void {
    this.agentCallback = cb;
  }

  set_agent_callback(cb: AgentCallback): void {
    this.setAgentCallback(cb);
  }

  /** Called when the user approves/denies an authority gate. */
  setApprovalCallback(cb: ApprovalCallback): void {
    this.approvalCallback = cb;
  }

  set_approval_callback(cb: ApprovalCallback): void {
    this.setApprovalCallback(cb);
  }

  /** Send a message to the configured chat. Safe to call from anywhere. */
  async sendMessage(text: string, parseMode = "Markdown"): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      if (!this.bot) await this.ensureBot();
      if (!this.bot) return;
      await this.bot.api.sendMessage(this.chatId, text.slice(0, 4096), {
        parse_mode: parseMode,
      });
    } catch (e) {
      debug(`Telegram send failed: ${errMsg(e)}`, "axoniz.comms.telegram");
    }
  }

  private async ensureBot(): Promise<GrammyBot | null> {
    if (this.bot) return this.bot;
    if (!this.isConfigured()) return null;
    try {
      const { Bot } = (await import("grammy")) as unknown as {
        Bot: new (token: string) => GrammyBot;
      };
      this.bot = new Bot(this.token);
      this.wireCommands(this.bot);
      return this.bot;
    } catch (e) {
      debug(
        `grammy not installed — run 'pnpm add grammy' (${errMsg(e)})`,
        "axoniz.comms.telegram",
      );
      return null;
    }
  }

  private wireCommands(bot: GrammyBot): void {
    const guard = (ctx: GrammyContext): boolean => {
      // Security: only respond to the configured chat id.
      const incoming = String(ctx.message?.chat?.id ?? "");
      return !this.chatId || incoming === String(this.chatId);
    };

    const textOf = (ctx: GrammyContext): string => (ctx.message?.text ?? "").trim();

    for (const cmd of [
      "ask",
      "status",
      "approve",
      "deny",
      "pause",
      "resume",
      "audit",
      "goals",
      "help",
    ]) {
      bot.command(cmd, async (ctx) => {
        if (!guard(ctx)) return;
        await this.dispatch(textOf(ctx));
      });
    }

    // Non-command messages are treated as /ask.
    bot.on("message:text", async (ctx) => {
      if (!guard(ctx)) return;
      const text = textOf(ctx);
      if (text && !text.startsWith("/")) await this.dispatch(`/ask ${text}`);
    });
  }

  /** Start polling in the background. */
  async start(): Promise<void> {
    if (!this.isConfigured()) {
      debug(
        "[Telegram] Not configured — set AXONIZ_TELEGRAM_TOKEN and AXONIZ_TELEGRAM_CHAT_ID",
        "axoniz.comms.telegram",
      );
      return;
    }
    if (this.running) return;

    const bot = await this.ensureBot();
    if (!bot) return;

    this.running = true;
    // Long-poll in the background; grammy keeps polling until stop().
    void bot
      .start({ drop_pending_updates: true })
      .catch((e: unknown) => debug(`Telegram poll error: ${errMsg(e)}`, "axoniz.comms.telegram"));
    info("[Telegram] Bot started", "axoniz.comms.telegram");
  }

  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.bot?.stop();
    } catch {
      /* ignore */
    }
  }

  private async dispatch(text: string): Promise<void> {
    const m = text.match(/^(\S+)\s*([\s\S]*)$/);
    const cmd = (m?.[1] ?? "").toLowerCase();
    const arg = (m?.[2] ?? "").trim();

    try {
      switch (cmd) {
        case "/ask": {
          if (!arg) {
            await this.sendMessage("Usage: /ask [task]");
            return;
          }
          await this.sendMessage(`\u2694\ufe0f Worker Swarm deploying on: _${arg}_`, "Markdown");
          // Fire and forget, mirroring the Python background thread.
          void (async () => {
            try {
              if (this.agentCallback) {
                const result = await this.agentCallback(arg);
                await this.sendMessage(`\u2705 Done:\n${String(result).slice(0, 2000)}`);
              } else {
                await this.sendMessage("\u274c No agent connected.");
              }
            } catch (e) {
              await this.sendMessage(`\u274c Failed: ${errMsg(e)}`);
            }
          })();
          return;
        }

        case "/status":
          await this.sendStatus();
          return;

        case "/approve":
          if (!arg) {
            await this.sendMessage("Usage: /approve [decision_id]");
            return;
          }
          if (this.approvalCallback) {
            this.approvalCallback(arg, true);
            await this.sendMessage(`\u2705 Approved: \`${arg}\``, "Markdown");
          } else {
            await this.sendMessage("No approval callback registered.");
          }
          return;

        case "/deny":
          if (!arg) {
            await this.sendMessage("Usage: /deny [decision_id]");
            return;
          }
          if (this.approvalCallback) {
            this.approvalCallback(arg, false);
            await this.sendMessage(`\ud83d\udeab Denied: \`${arg}\``, "Markdown");
          } else {
            await this.sendMessage("No approval callback registered.");
          }
          return;

        case "/pause":
          try {
            const { getEngine } = (await import("../core/authority.js")) as {
              getEngine: () => { emergency_pause(): void };
            };
            getEngine().emergency_pause();
            await this.sendMessage("\ud83d\uded1 Emergency pause activated. All actions blocked.");
          } catch (e) {
            await this.sendMessage(`Error: ${errMsg(e)}`);
          }
          return;

        case "/resume":
          try {
            const { getEngine } = (await import("../core/authority.js")) as {
              getEngine: () => { resume(): void };
            };
            getEngine().resume();
            await this.sendMessage("\u25b6\ufe0f Resumed. Actions allowed.");
          } catch (e) {
            await this.sendMessage(`Error: ${errMsg(e)}`);
          }
          return;

        case "/audit":
          try {
            const { getEngine } = (await import("../core/authority.js")) as {
              getEngine: () => { recent_audit(n: number): string };
            };
            await this.sendMessage(getEngine().recent_audit(10));
          } catch (e) {
            await this.sendMessage(`Error: ${errMsg(e)}`);
          }
          return;

        case "/goals":
          try {
            const { getGoalService } = (await import("../goals/service.js")) as {
              getGoalService: () => { daily_report(): string };
            };
            await this.sendMessage(getGoalService().daily_report().slice(0, 2000));
          } catch (e) {
            await this.sendMessage(`Goals unavailable: ${errMsg(e)}`);
          }
          return;

        case "/help":
          await this.sendMessage(
            "\u2694\ufe0f *FRAZIYM AI Commands*\n" +
              "/ask [task] \u2014 run a task\n" +
              "/status \u2014 system status\n" +
              "/approve [id] \u2014 approve gate\n" +
              "/deny [id] \u2014 deny gate\n" +
              "/pause \u2014 emergency stop\n" +
              "/resume \u2014 resume\n" +
              "/goals \u2014 goal status\n" +
              "/audit \u2014 recent audit log",
            "Markdown",
          );
          return;

        default:
          await this.sendMessage(`Unknown command: ${cmd} (try /help)`);
          return;
      }
    } catch (e) {
      await this.sendMessage(`\u274c Error: ${errMsg(e)}`);
    }
  }

  private async sendStatus(): Promise<void> {
    const lines = ["\u2694\ufe0f *FRAZIYM AI Status*"];
    try {
      const { getEngine } = (await import("../core/authority.js")) as {
        getEngine: () => { summary(): string };
      };
      lines.push(getEngine().summary());
    } catch {
      /* authority optional */
    }
    try {
      const { getGoalService } = (await import("../goals/service.js")) as {
        getGoalService: () => { count(): number };
      };
      lines.push(`Goals: ${getGoalService().count()} active`);
    } catch {
      /* goals optional */
    }
    await this.sendMessage(lines.join("\n"), "Markdown");
  }
}

/* ── Singleton ────────────────────────────────────────────────────────────── */

let botInstance: AxonizTelegramBot | null = null;

export function getBot(): AxonizTelegramBot {
  if (botInstance === null) {
    try {
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      const tg = (cfg.telegram ?? {}) as Record<string, string>;
      const token = tg.token || process.env.AXONIZ_TELEGRAM_TOKEN || "";
      const chatId = tg.chat_id || process.env.AXONIZ_TELEGRAM_CHAT_ID || "";
      botInstance = new AxonizTelegramBot(token, chatId);
    } catch {
      botInstance = new AxonizTelegramBot();
    }
  }
  return botInstance;
}

export const get_bot = getBot;

/** Start the Telegram bot, wired to the agent if provided. */
export async function startBot(opts: { agentCallback?: AgentCallback } = {}): Promise<AxonizTelegramBot> {
  const bot = getBot();
  if (opts.agentCallback) bot.setAgentCallback(opts.agentCallback);
  try {
    const { getEngine } = (await import("../core/authority.js")) as unknown as {
      getEngine: () => { delivery: { resolve(approved: boolean): void } };
    };
    // The authority engine's delivery hook resolves a pending gate with a
    // boolean; the Telegram command carries a decision id plus the verdict, so
    // the id is informational and the verdict drives the gate.
    bot.setApprovalCallback((_decisionId: string, approved: boolean) => {
      getEngine().delivery.resolve(approved);
    });
  } catch {
    /* authority optional */
  }
  await bot.start();
  return bot;
}

export const start_bot = startBot;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
