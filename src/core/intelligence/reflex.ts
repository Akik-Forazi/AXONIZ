/**
 * AXONIZ ShadowGuard — The Reflex Engine.
 * High-speed, low-memory intent detection and autonomous response.
 * Acts like a 'Shadow Guard' that protects and serves instantly.
 *
 * Port notes (Python → Node):
 *   - `threading.Thread(target=self.brain.load, daemon=True)` → `void
 *     this.brain.load()` (Node is single-threaded; the load is I/O-ish).
 *   - `transformers.pipeline("text-generation", ...)` → NOT AVAILABLE. See
 *     `ReflexBrain.load()` for the documented degradation: the heuristic reflex
 *     table is the working path, exactly as in Python when the pipeline failed
 *     to load.
 *   - `pyautogui` / `ctypes.windll` / `webbrowser` → `node:child_process` +
 *     the `open` package (best effort, always unref'd and swallowed on error).
 *   - `axoniz.core.optimizer.get_hardware_profile()` → `systeminformation`,
 *     fetched once in the background and cached, so `process()` can stay
 *     SYNCHRONOUS like the Python original.
 *   - `process()` keeps its synchronous signature: every reflex action returns
 *     a string immediately.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";

import { debug, info, warn } from "../debug.js";

/* ── Reflex Configuration ────────────────────────────────────────────────────── */
// Reflex Brain is optional and uses standard model paths.
// It will only load if a valid model path is provided via environment or is
// present in the standard search paths.

/** The `transformers` text-generation pipeline signature `classify()` calls. */
export type ReflexPipeline = (prompt: string, options: Record<string, unknown>) => unknown;

/** A tiny brain for semantic intent classification. */
export class ReflexBrain {
  model_path: string;
  _pipeline: ReflexPipeline | null = null;
  _intent_map: Record<string, string[]> = {
    browser: ["open browser", "start chrome", "google search"],
    editor: ["open vscode", "start coding", "edit files"],
    screenshot: ["take screenshot", "capture screen"],
    system: ["lock pc", "check ram", "hardware status"],
    time: ["what time", "today's date"],
  };

  constructor(model_path: string) {
    this.model_path = model_path;
  }

  /**
   * FIDELITY LOSS: Python built a HuggingFace `transformers` text-generation
   * pipeline here. No inference dependency for a transformers model directory is
   * available in the Node dependency set, so this is a documented no-op that
   * keeps the public API and the *behaviour* Python exhibited when loading
   * failed: `_pipeline` stays null and `classify()` returns null, leaving the
   * heuristic reflex table as the sole working path. An external caller may
   * still inject a `_pipeline` to re-enable semantic classification.
   */
  async load(): Promise<void> {
    if (this._pipeline) return;
    if (!fs.existsSync(this.model_path)) {
      warn(`[ShadowGuard] Reflex Brain path not found: ${this.model_path}`);
      return;
    }
    info(`[ShadowGuard] Loading Reflex Brain: ${this.model_path}`);
    this._pipeline = null;
  }

  classify(text: string): string | null {
    if (!this._pipeline) return null;
    // Simple semantic mapping
    const prompt = `User: ${text}\nIntent:`;
    try {
      const out = this._pipeline(prompt, { max_new_tokens: 5, do_sample: false });
      const first = (Array.isArray(out) ? out[0] : out) as Record<string, unknown> | undefined;
      const generated = String(first?.["generated_text"] ?? "");
      const gen = generated.slice(prompt.length).toLowerCase().trim();
      for (const [intent, keywords] of Object.entries(this._intent_map)) {
        if (keywords.some((k) => gen.includes(k)) || gen.includes(intent)) {
          return intent;
        }
      }
    } catch {
      /* classification is best effort */
    }
    return null;
  }

  /** Async door for callers that can await a future inference backend. */
  async classify_async(text: string): Promise<string | null> {
    return this.classify(text);
  }

  /** camelCase alias. */
  classifyAsync(text: string): Promise<string | null> {
    return this.classify_async(text);
  }
}

export interface ReflexComputerTools {
  screen_capture?(filename: string): unknown;
  key_press?(keys: string): unknown;
}

/** The subset of the Agent surface the reflex layer touches. */
export interface ReflexAgent {
  health?: unknown;
  computer_tools?: ReflexComputerTools;
  computerTools?: ReflexComputerTools;
}

interface HardwareProfile {
  cpu_count: number;
  total_ram_gb: number;
  has_gpu: boolean;
}

type ReflexAction = (match: RegExpExecArray | null) => string;

export class ShadowGuardReflex {
  agent: ReflexAgent | null;
  brain: ReflexBrain | null = null;
  reflexes: Array<[RegExp, ReflexAction]>;
  _hw: HardwareProfile | null = null;

  constructor(agent: ReflexAgent | null = null) {
    this.agent = agent;

    // Load from optional environment variable, no hardcoded path
    const reflex_model = process.env.AXONIZ_REFLEX_MODEL;
    if (reflex_model && fs.existsSync(reflex_model)) {
      this.brain = new ReflexBrain(reflex_model);
      // Python: threading.Thread(target=self.brain.load, daemon=True).start()
      void this.brain.load();
    }

    // Heuristic fallback patterns
    this.reflexes = [
      [
        /\b(open|start|launch)\b.*?\b(chrome|browser|google)\b/,
        _named((m) => this._open_browser(m), "_open_browser"),
      ],
      [
        /\b(open|start|launch)\b.*?\b(vscode|code|editor)\b/,
        _named((m) => this._open_editor(m), "_open_editor"),
      ],
      [
        /\b(take|grab|make)\b.*?\b(screenshot|picture|screen)\b/,
        _named((m) => this._screenshot(m), "_screenshot"),
      ],
      [/\b(what|tell me)\b.*?\b(time|clock)\b/, _named((m) => this._get_time(m), "_get_time")],
      [/\b(what|tell me)\b.*?\b(date|today)\b/, _named((m) => this._get_date(m), "_get_date")],
      [
        /\b(minimize|hide)\b.*?\b(all|windows)\b/,
        _named((m) => this._minimize_all(m), "_minimize_all"),
      ],
      [/\b(lock)\b.*?\b(computer|pc|screen)\b/, _named((m) => this._lock_pc(m), "_lock_pc")],
      [
        /\b(search|find)\b.*?\b(for|on web)\b\s+(.*)/,
        _named((m) => this._web_search(m), "_web_search"),
      ],
      [
        /\b(how much|check)\b.*?\b(ram|memory|cpu|hardware)\b/,
        _named((m) => this._check_hardware(m), "_check_hardware"),
      ],
    ];

    // Python read the hardware profile synchronously from the optimizer; the
    // Node equivalent (`systeminformation`) is async, so it is cached in the
    // background while `process()`/`_check_hardware()` stay synchronous.
    if (this.agent) {
      void this._refresh_hardware();
    }
  }

  /** Process text and return a response if a reflex was triggered. */
  process(text: string): string | null {
    const low = text.toLowerCase().trim();

    // 1. AI-Powered semantic check (Reflex Brain)
    if (this.brain) {
      const intent = this.brain.classify(low);
      if (intent) {
        info(`[ShadowGuard] AI Intent detected: ${intent}`);
        if (intent === "browser") return this._open_browser(null);
        if (intent === "editor") return this._open_editor(null);
        if (intent === "screenshot") return this._screenshot(null);
        if (intent === "system") return this._check_hardware(null);
        if (intent === "time") return this._get_time(null);
      }
    }

    // 2. Heuristic fallback patterns
    for (const [pattern, action] of this.reflexes) {
      const match = pattern.exec(low);
      if (match) {
        info(`[ShadowGuard] Reflex triggered: ${action.name}`);
        return action(match);
      }
    }
    return null;
  }

  /* ── Reflex Actions ──────────────────────────────────────────────────────── */

  _open_browser(match: RegExpExecArray | null): string {
    void match;
    try {
      if (process.platform === "win32") {
        const child = spawn("cmd", ["/c", "start", "chrome"], {
          shell: true,
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      } else {
        const child = spawn("open", ["-a", "Google Chrome"], { detached: true, stdio: "ignore" });
        child.unref();
      }
    } catch (e) {
      debug(`[ShadowGuard] open browser failed: ${errText(e)}`);
    }
    return "Opening Chrome, my liege.";
  }

  _open_editor(match: RegExpExecArray | null): string {
    void match;
    try {
      const child = spawn("code", ["."], { shell: true, detached: true, stdio: "ignore" });
      child.unref();
    } catch (e) {
      debug(`[ShadowGuard] open editor failed: ${errText(e)}`);
    }
    return "VS Code is launching in the current workspace.";
  }

  _screenshot(match: RegExpExecArray | null): string {
    void match;
    const ct = this.agent?.computer_tools ?? this.agent?.computerTools;
    if (this.agent && ct && typeof ct.screen_capture === "function") {
      const res = String(ct.screen_capture("reflex_capture.png") ?? "");
      if (res.includes("[OK]")) {
        return "Screenshot captured and saved to workspace.";
      }
    }
    return "I've captured the screen for you.";
  }

  /** Python's `datetime.now().strftime('%I:%M %p')`. */
  _get_time(match: RegExpExecArray | null): string {
    void match;
    const d = new Date();
    let h = d.getHours() % 12;
    if (h === 0) h = 12;
    const hh = String(h).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ap = d.getHours() < 12 ? "AM" : "PM";
    return `It is currently ${hh}:${mm} ${ap}.`;
  }

  /** Python's `datetime.now().strftime('%A, %B %d, %Y')`. */
  _get_date(match: RegExpExecArray | null): string {
    void match;
    const d = new Date();
    const weekday = _WEEKDAYS[d.getDay()] ?? "";
    const month = _MONTHS[d.getMonth()] ?? "";
    return `Today is ${weekday}, ${month} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}.`;
  }

  _minimize_all(match: RegExpExecArray | null): string {
    void match;
    if (process.platform === "win32") {
      // Minimize the active window via the shell COM object (ctypes.windll is
      // not available in Node).
      try {
        const child = spawn(
          "powershell",
          ["-NoProfile", "-Command", "(New-Object -ComObject Shell.Application).MinimizeAll()"],
          { detached: true, stdio: "ignore" },
        );
        child.unref();
      } catch (e) {
        debug(`[ShadowGuard] minimize failed: ${errText(e)}`);
      }
      // For all windows, win+d is better but requires the computer tools
      const ct = this.agent?.computer_tools ?? this.agent?.computerTools;
      if (this.agent && ct && typeof ct.key_press === "function") {
        try {
          ct.key_press("winleft+d");
        } catch (e) {
          debug(`[ShadowGuard] key_press failed: ${errText(e)}`);
        }
        return "All windows minimized.";
      }
    }
    return "Minimizing workspace.";
  }

  _lock_pc(match: RegExpExecArray | null): string {
    void match;
    if (process.platform === "win32") {
      try {
        const child = spawn("rundll32.exe", ["user32.dll,LockWorkStation"], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      } catch (e) {
        debug(`[ShadowGuard] lock failed: ${errText(e)}`);
      }
      return "System locked.";
    }
    return "I cannot lock this OS yet.";
  }

  _web_search(match: RegExpExecArray | null): string {
    // Python: `match.group(3) if match.lastindex >= 3 else "nothing"`
    const query = match && match[3] !== undefined ? match[3] : "nothing";
    const url = `https://www.google.com/search?q=${query}`;
    void import("open")
      .then((m) => m.default(url))
      .catch(() => undefined);
    return `Searching the web for ${query}.`;
  }

  _check_hardware(match: RegExpExecArray | null): string {
    void match;
    if (this.agent && this.agent.health !== undefined) {
      if (this._hw) {
        const hw = this._hw;
        return `You have ${hw.cpu_count} CPU cores and ${hw.total_ram_gb}GB of RAM. ${
          hw.has_gpu ? "GPU detected." : "No GPU found."
        }`;
      }
      return "Hardware check failed, but the system is running stable.";
    }
    return "System resources are within optimal bounds.";
  }

  /** Background replacement for `optimizer.get_hardware_profile()`. */
  async _refresh_hardware(): Promise<void> {
    try {
      const si = await import("systeminformation");
      const [cpu, mem, gfx] = await Promise.all([si.cpu(), si.mem(), si.graphics()]);
      this._hw = {
        cpu_count: Number(cpu.processors ?? cpu.cores ?? 0),
        total_ram_gb: Math.round(Number(mem.total ?? 0) / 1024 ** 3),
        has_gpu: Array.isArray(gfx.controllers) && gfx.controllers.length > 0,
      };
    } catch (e) {
      debug(`[ShadowGuard] Hardware probe failed: ${errText(e)}`);
    }
  }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

const _WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const _MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Give a wrapper the Python action's `__name__` so logs stay identical. */
function _named(fn: ReflexAction, name: string): ReflexAction {
  try {
    Object.defineProperty(fn, "name", { value: name, configurable: true });
  } catch {
    /* frozen function objects are fine — the log just loses the name */
  }
  return fn;
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  return String(e);
}
