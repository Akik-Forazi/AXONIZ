/**
 * src/voice/voice_loop.ts
 * ===========================
 * AXONIZ Voice Loop — full conversation state machine.
 *
 * Flow:
 *   IDLE -[wake word]- ACKNOWLEDGING (earcon + "Yes, my liege")
 *                       - LISTENING   (STT, 8s window)
 *                       - THINKING    (agent run + stream tokens)
 *                       - SPEAKING    (TTS the trimmed response)
 *                       - FOLLOW_UP   (smart contextual follow-up)
 *                       - back to IDLE
 *
 * Natural tone rules:
 *   - Short acks. Never robotic. Never "Processing your request."
 *   - Time-aware: knows the date, time, day of week
 *   - After a task: say what was done in one sentence, ask what's next
 *   - Code blocks are never read aloud — summarised instead
 *   - Interruption: new wake word during speech cancels and re-listens
 */

import { getLogger } from "../core/logger.js";
import { get_tts, type TTSEngine } from "./tts.js";
import { get_stt, type STTEngine } from "./stt.js";
import { get_wake_detector, type WakeWordDetector } from "./wake_word.js";

const logger = getLogger();

/* ── State machine ─────────────────────────────────────────────────────────── */

export enum VoiceState {
  IDLE = "IDLE",
  ACKNOWLEDGING = "ACKNOWLEDGING",
  LISTENING = "LISTENING",
  THINKING = "THINKING",
  SPEAKING = "SPEAKING",
  FOLLOW_UP = "FOLLOW_UP",
}

/* ── Personality phrase banks ──────────────────────────────────────────────── */

const _ACK_PHRASES = [
  "Yes?",
  "Listening.",
  "Go ahead.",
  "Here.",
  "Ready.",
  "At your command.",
  "What do you need?",
];

const _THINK_PHRASES = [
  "On it.",
  "Give me a second.",
  "Working on that.",
  "Let me check.",
  "One moment.",
];

const _DONE_TRANSITIONS = [
  "What else?",
  "Anything else?",
  "What's next?",
  "Standing by.",
  "Your call.",
];

const _ERROR_PHRASES = [
  "Didn't catch that — try again.",
  "Say that once more.",
  "I couldn't hear you clearly.",
];

const _STOP_WORDS = new Set([
  "stop listening",
  "go to sleep",
  "shut up",
  "quiet",
  "nevermind",
]);

export function _pick(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)] ?? "";
}

/* ── Time helpers ──────────────────────────────────────────────────────────── */

/** `%I:%M %p` with the Python `.lstrip("0")` behaviour ("07:30 PM" → "7:30 PM"). */
function twelveHourClock(d: Date): string {
  const raw = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return raw.replace(/^0/, "");
}

export function _natural_time(): string {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (minute === 0) {
    const h12 = hour % 12 || 12;
    return `${h12} o'clock ${hour < 12 ? "AM" : "PM"}`;
  }
  return twelveHourClock(now);
}

export function _natural_datetime(): string {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = now
    .toLocaleDateString("en-US", { month: "long", day: "2-digit" })
    .replace(" 0", " ");
  const hour = now.getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `${day} ${date}, ${period}`;
}

/* ── Response trimmer (voice-optimised) ────────────────────────────────────── */

/**
 * Convert an agent text response into something natural to speak aloud.
 * - Drops code blocks entirely (just says "code block attached")
 * - Removes markdown
 * - Keeps the first meaningful sentences up to `max_chars`
 */
export function _voice_trim(text: string, maxChars = 350): string {
  const hadCode = /```/.test(text);
  let out = text.replace(/```[\s\S]*?```/g, ""); // drop code blocks
  out = out.replace(/`([^`\n]+)`/g, "$1"); // inline code
  out = out.replace(/\*\*(.*?)\*\*/g, "$1"); // bold
  out = out.replace(/\*(.*?)\*/g, "$1"); // italic
  out = out.replace(/#{1,6}\s+/g, ""); // headings
  out = out.replace(/\n{2,}/g, ". ");
  out = out.replace(/\s{2,}/g, " ").trim();

  const suffix = hadCode ? " I've attached the code to the chat." : "";

  if (out.length <= maxChars) return (out + suffix).trim();

  const sentences = out.split(/(?<=[.!?])\s+/);
  let trimmed = "";
  for (const s of sentences) {
    if (trimmed.length + s.length > maxChars) break;
    trimmed += s + " ";
  }
  trimmed = trimmed.trim();
  if (!trimmed) trimmed = out.slice(0, maxChars).replace(/\s+$/, "") + "…";
  return (trimmed + suffix).trim();
}

/* ── Follow-up generator ───────────────────────────────────────────────────── */

export function _make_followup(task: string, response: string): string | null {
  const t = task.toLowerCase();
  const r = response.toLowerCase();
  if (["fix", "bug", "error", "crash", "broken"].some((w) => t.includes(w))) {
    return "Want me to run the tests?";
  }
  if (["write", "create", "build", "generate", "make"].some((w) => t.includes(w))) {
    return "Shall I commit this?";
  }
  if (["search", "find", "look up", "check"].some((w) => t.includes(w))) {
    return "Want me to dig deeper on any of that?";
  }
  if (t.includes("time") || t.includes("date") || t.includes("day")) {
    return null; // No follow-up for time queries
  }
  if (["explain", "what", "how", "why", "tell me"].some((w) => t.includes(w))) {
    return "Want me to expand on any part?";
  }
  if (r.includes("error") || r.includes("failed") || r.includes("couldn't")) {
    return "Should I try to fix that?";
  }
  return _pick(_DONE_TRANSITIONS);
}

/* ── Signals (replacing threading.Event) ───────────────────────────────────── */

class Signal {
  private _set = false;
  private _waiters: Array<() => void> = [];

  set(): void {
    this._set = true;
    const waiters = this._waiters;
    this._waiters = [];
    for (const w of waiters) w();
  }

  clear(): void {
    this._set = false;
  }

  is_set(): boolean {
    return this._set;
  }

  /** Returns true immediately when set, else races `timeoutSeconds`. */
  async wait(timeoutSeconds: number): Promise<boolean> {
    if (this._set) return true;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const timer = setTimeout(() => done(false), Math.max(0, timeoutSeconds * 1000));
      this._waiters.push(() => {
        clearTimeout(timer);
        done(true);
      });
    });
  }
}

/* ── Agent seam ────────────────────────────────────────────────────────────── */

/** Minimal shape of the axoniz Agent used by the loop. */
export interface VoiceAgent {
  run(task: string): string | Promise<string>;
}

/* ── Main loop class ───────────────────────────────────────────────────────── */

export interface VoiceLoopOptions {
  on_state_change?: (state: string) => void;
  listen_timeout?: number;
  auto_followup?: boolean;
}

export class VoiceLoop {
  /**
   * AXONIZ's always-on voice interface.
   * Wire to an Agent, call `start()`. The loop runs as a cancellable task.
   */
  agent: VoiceAgent;
  on_state_change: ((state: string) => void) | null;
  listen_timeout: number;
  auto_followup: boolean;

  private _state: VoiceState = VoiceState.IDLE;
  private _stop_ev = new Signal();
  private _wake_ev = new Signal();
  private _speak_stop_ev = new Signal();
  private _main_thread: Promise<void> | null = null;

  private _tts: TTSEngine | null = null;
  private _stt: STTEngine | null = null;
  private _wwd: WakeWordDetector | null = null;

  constructor(agent: VoiceAgent, options: VoiceLoopOptions = {}) {
    this.agent = agent;
    this.on_state_change = options.on_state_change ?? null;
    this.listen_timeout = options.listen_timeout ?? 8;
    this.auto_followup = options.auto_followup ?? true;
  }

  /* ── lifecycle ──────────────────────────────────────────────────────────── */

  start(): void {
    this._stop_ev.clear();
    this._init_engines();
    this._main_thread = this._loop()
      .catch((e: unknown) => {
        logger.error(`[VoiceLoop] loop crashed: ${errText(e)}`);
      })
      .finally(() => {
        this._main_thread = null;
      });
    logger.info("[VoiceLoop] started");
  }

  stop(): void {
    this._stop_ev.set();
    this._wwd?.stop();
    logger.info("[VoiceLoop] stopped");
  }

  is_running(): boolean {
    return this._main_thread !== null;
  }

  isRunning(): boolean {
    return this.is_running();
  }

  get state(): string {
    return this._state;
  }

  interrupt(): void {
    this._speak_stop_ev.set();
  }

  /* ── engine init ────────────────────────────────────────────────────────── */

  private _init_engines(): void {
    this._tts = get_tts();
    this._stt = get_stt();
    this._wwd = get_wake_detector((word: string) => this._on_wake(word));
    this._wwd.start();
    logger.info(
      `[VoiceLoop] TTS=${this._tts.info().backend} ` +
        `STT=${this._stt.info().backend} WakeWord=${this._wwd.backend}`,
    );
  }

  /* ── wake callback ──────────────────────────────────────────────────────── */

  private _on_wake(_word: string): void {
    if (this._state === VoiceState.THINKING || this._state === VoiceState.LISTENING) return;
    if (this._state === VoiceState.SPEAKING) {
      this.interrupt();
    }
    this._wake_ev.set();
  }

  /* ── state helpers ──────────────────────────────────────────────────────── */

  /** Lazy-load TTS on first use. */
  private _get_tts(): TTSEngine | null {
    if (this._tts === null) {
      try {
        this._tts = get_tts();
        logger.info(`[VoiceLoop] TTS loaded: ${this._tts.info().backend}`);
      } catch (e) {
        logger.error(`[VoiceLoop] TTS load failed: ${errText(e)}`);
        return null;
      }
    }
    return this._tts;
  }

  /** Lazy-load STT on first use. */
  private _get_stt(): STTEngine | null {
    if (this._stt === null) {
      try {
        this._stt = get_stt();
        logger.info(`[VoiceLoop] STT loaded: ${this._stt.info().backend}`);
      } catch (e) {
        logger.error(`[VoiceLoop] STT load failed: ${errText(e)}`);
        return null;
      }
    }
    return this._stt;
  }

  private _set_state(s: VoiceState): void {
    this._state = s;
    if (this.on_state_change) {
      try {
        this.on_state_change(s);
      } catch {
        /* callback errors must never break the loop */
      }
    }
  }

  /* ── TTS with interrupt ─────────────────────────────────────────────────── */

  /**
   * Speak `text`, optionally aborting when `interrupt()` is called.
   *
   * TODO(port): Python spawned a thread and polled `threading.Event`; the audio
   * device write itself was never cancellable either. Here the speak promise is
   * raced against the abort signal — playback already in flight cannot be
   * stopped because no Node audio driver exposes a cancel handle yet.
   */
  private async _speak(text: string, interruptible = true): Promise<void> {
    const tts = this._get_tts();
    if (!text || !tts) return;
    this._speak_stop_ev.clear();
    this._set_state(VoiceState.SPEAKING);

    const speaking = tts.speak(text).catch((e: unknown) => {
      logger.debug(`[VoiceLoop] speak error: ${errText(e)}`);
      return false;
    });

    if (!interruptible) {
      await speaking;
      return;
    }

    await Promise.race([
      speaking,
      (async (): Promise<void> => {
        while (!this._speak_stop_ev.is_set()) {
          await new Promise((r) => setTimeout(r, 50));
        }
      })(),
    ]);
  }

  /* ── STT ────────────────────────────────────────────────────────────────── */

  private async _listen(): Promise<string | null> {
    this._set_state(VoiceState.LISTENING);
    const stt = this._get_stt();
    if (!stt || !stt.is_available) return null;
    try {
      const text = await stt.listen(this.listen_timeout);
      if (text) logger.info(`[VoiceLoop] heard: '${text}'`);
      return text ? text.trim() : null;
    } catch (e) {
      logger.error(`[VoiceLoop] STT error: ${errText(e)}`);
      return null;
    }
  }

  /* ── Time query shortcut (no LLM needed) ────────────────────────────────── */

  private _handle_time_query(task: string): string | null {
    const low = task.toLowerCase();
    if (["what time", "what's the time", "current time"].some((p) => low.includes(p))) {
      return `It's ${twelveHourClock(new Date())}.`;
    }
    if (
      ["what day", "what date", "today's date", "what's today"].some((p) => low.includes(p))
    ) {
      const now = new Date();
      const formatted = now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "2-digit",
        year: "numeric",
      });
      return `Today is ${formatted}.`;
    }
    if (["what year", "current year"].some((p) => low.includes(p))) {
      return `It's ${new Date().getFullYear()}.`;
    }
    return null;
  }

  /* ── Main loop ──────────────────────────────────────────────────────────── */

  private async _loop(): Promise<void> {
    logger.info("[VoiceLoop] idle — waiting for wake word");
    while (!this._stop_ev.is_set()) {
      this._set_state(VoiceState.IDLE);
      const fired = await this._wake_ev.wait(1.0);
      if (!fired) continue;
      this._wake_ev.clear();
      if (this._stop_ev.is_set()) break;

      // Acknowledge
      this._set_state(VoiceState.ACKNOWLEDGING);
      await this._speak(_pick(_ACK_PHRASES), false);

      // Listen
      const task = await this._listen();
      if (!task) {
        await this._speak(_pick(_ERROR_PHRASES));
        continue;
      }

      // Stop command
      if ([..._STOP_WORDS].some((s) => task.toLowerCase().includes(s))) {
        await this._speak("Got it. Going quiet.");
        continue;
      }

      // Fast-path: time queries handled locally, no LLM roundtrip
      const quick = this._handle_time_query(task);
      if (quick) {
        await this._speak(quick);
        continue;
      }

      // Think
      this._set_state(VoiceState.THINKING);
      await this._speak(_pick(_THINK_PHRASES), false);

      let response = "";
      try {
        response = await this.agent.run(task);
      } catch (e) {
        logger.error(`[VoiceLoop] agent error: ${errText(e)}`);
        response = `I hit an error: ${errText(e)}`;
      }

      // Speak response
      const spoken = _voice_trim(response);
      await this._speak(spoken);

      if (this._stop_ev.is_set()) break;

      // Follow-up
      if (this.auto_followup && response && !this._speak_stop_ev.is_set()) {
        this._set_state(VoiceState.FOLLOW_UP);
        const followup = _make_followup(task, response);
        if (followup) {
          await new Promise((r) => setTimeout(r, 500));
          await this._speak(followup);
        }
      }
    }

    this._set_state(VoiceState.IDLE);
  }
}

/* ── singletons ────────────────────────────────────────────────────────────── */

let _loop_instance: VoiceLoop | null = null;

export function get_voice_loop(agent: VoiceAgent, kwargs: VoiceLoopOptions = {}): VoiceLoop {
  if (_loop_instance === null) {
    _loop_instance = new VoiceLoop(agent, kwargs);
  }
  return _loop_instance;
}

/** camelCase alias of `get_voice_loop`. */
export const getVoiceLoop = get_voice_loop;

export function start_voice_loop(agent: VoiceAgent, kwargs: VoiceLoopOptions = {}): VoiceLoop {
  const vl = get_voice_loop(agent, kwargs);
  if (!vl.is_running()) vl.start();
  return vl;
}

/** camelCase alias of `start_voice_loop`. */
export const startVoiceLoop = start_voice_loop;

/** Test/DI hook — replace the singleton. */
export function setVoiceLoop(loop: VoiceLoop | null): void {
  _loop_instance = loop;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
