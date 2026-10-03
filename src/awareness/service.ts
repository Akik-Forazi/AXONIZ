/**
 * src/awareness/service.ts
 * ============================
 * AXONIZ Awareness Service — proactive environment monitoring.
 *
 * Inspired by Jarvis src/awareness/ — Python reimplementation, now ported.
 *
 * Monitors:
 *   - Screen content via screenshot + OCR (tesseract via node:child_process)
 *   - Clipboard changes
 *   - Active window title
 *   - System load (CPU/RAM/disk)
 *   - Proactively suggests relevant actions based on context
 *
 * AXONIZ wakes up and says: "I see you're looking at X — want me to Y?"
 *
 * ── Port notes ───────────────────────────────────────────────────────────────
 *   psutil          → `systeminformation` (installed) with a zero-dep fallback
 *   pyautogui/PIL   → `screenshot-desktop` (installed) + `sharp` (installed)
 *   pytesseract     → shell out to the `tesseract` binary (this is exactly what
 *                     pytesseract does internally)
 *   pyperclip/win32 → PowerShell `Get-Clipboard` / `pbpaste` / `xclip`
 *
 * Every degraded capability returns a clear `[ERROR] …`/`[X unavailable …]`
 * string and never throws.
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLogger } from "../core/logger.js";
import { info as logInfo, debug as logDebug } from "../core/debug.js";
import { whichSync } from "../core/which.js";
import { loadConfig } from "../core/config.js";

const logger = getLogger();

/**
 * Optional-dependency loader.
 *
 * All three packages are CommonJS, so a plain `await import()` nests the real
 * exports under `.default`; `unwrapModule()` normalises that. Dynamic import also
 * resolves relative to *this* module (unlike `createRequire(import.meta.url)`,
 * which breaks when the compiled output lives outside the project tree).
 */
async function loadOptional<T>(id: string): Promise<T | null> {
  try {
    return unwrapModule<T>(await import(id));
  } catch (e) {
    logDebug(`[Awareness] optional dependency '${id}' unavailable: ${errText(e)}`);
    return null;
  }
}

/** Unwrap a CJS namespace object (`await import()` nests named exports in `.default`). */
function unwrapModule<T>(mod: unknown): T | null {
  if (mod === null || mod === undefined) return null;
  if (typeof mod !== "object") return mod as T;
  const record = mod as Record<string, unknown>;
  const dflt = record["default"];
  if (dflt !== undefined && (typeof dflt === "function" || typeof dflt === "object")) {
    return dflt as T;
  }
  return record as T;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Optional dependency handles
 * ──────────────────────────────────────────────────────────────────────────── */

interface SharpInstance {
  extract(region: { left: number; top: number; width: number; height: number }): SharpInstance;
  grayscale(): SharpInstance;
  normalize(): SharpInstance;
  png(): { toBuffer(): Promise<Buffer> };
  metadata(): Promise<{ width?: number; height?: number }>;
}
type SharpFactory = (input?: Buffer | string, options?: Record<string, unknown>) => SharpInstance;

let _sharp: SharpFactory | null | undefined;
async function getSharp(): Promise<SharpFactory | null> {
  if (_sharp === undefined) {
    _sharp = await loadOptional<SharpFactory>("sharp");
  }
  return _sharp;
}

type ScreenshotFn = ((options?: Record<string, unknown>) => Promise<Buffer>) & {
  listDisplays?: () => Promise<Array<{ id: number; name: string }>>;
};

let _screenshot: ScreenshotFn | null | undefined;
async function getScreenshot(): Promise<ScreenshotFn | null> {
  if (_screenshot === undefined) {
    _screenshot = await loadOptional<ScreenshotFn>("screenshot-desktop");
  }
  return _screenshot;
}

/* ────────────────────────────────────────────────────────────────────────────
 * System metrics
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SystemMetrics {
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  platform: string;
  /** Extra vendor fields (kept open so snapshots can carry richer metrics). */
  [key: string]: unknown;
}

let _cachedMetrics: SystemMetrics | null = null;
let _cachedMetricsAt = 0;
let _metricsInFlight: Promise<SystemMetrics> | null = null;

function osName(): string {
  switch (os.platform()) {
    case "win32":
      return "Windows";
    case "darwin":
      return "Darwin";
    case "linux":
      return "Linux";
    default:
      return os.platform();
  }
}

/**
 * Returns CPU, RAM and disk usage.
 *
 * TODO(port): Python used `psutil` behind an ImportError guard with a zero-dep
 * fallback. The Node equivalent is `systeminformation` (installed). This keeps
 * the synchronous Python signature by serving a short-lived cache and
 * refreshing in the background, so the very first call returns zeros exactly
 * like the Python fallback path did.
 */
export function get_system_metrics(): SystemMetrics {
  if (_cachedMetrics && Date.now() - _cachedMetricsAt < 2000) return _cachedMetrics;

  if (!_metricsInFlight) {
    _metricsInFlight = collectMetrics()
      .then((m) => {
        _cachedMetrics = m;
        _cachedMetricsAt = Date.now();
        return m;
      })
      .catch((e: unknown) => {
        logDebug(`[Awareness] metrics refresh failed: ${errText(e)}`);
        const fallback = emptyMetrics();
        _cachedMetrics = fallback;
        _cachedMetricsAt = Date.now();
        return fallback;
      })
      .finally(() => {
        _metricsInFlight = null;
      });
  }

  return _cachedMetrics ?? emptyMetrics();
}

function emptyMetrics(): SystemMetrics {
  return { cpu_percent: 0, ram_percent: 0, disk_percent: 0, platform: osName() };
}

/** Await a fresh metrics sample (used by the awareness loop). */
export async function getSystemMetricsAsync(): Promise<SystemMetrics> {
  const m = await collectMetrics().catch(() => emptyMetrics());
  _cachedMetrics = m;
  _cachedMetricsAt = Date.now();
  return m;
}

interface SiModule {
  currentLoad?: () => Promise<{ currentLoad?: number }>;
  mem?: () => Promise<{ active?: number; total?: number; used?: number }>;
  fsSize?: () => Promise<Array<{ use?: number }>>;
}

async function collectMetrics(): Promise<SystemMetrics> {
  const metrics = emptyMetrics();
  try {
    const si = await loadOptional<SiModule>("systeminformation");
    if (!si) return metrics;

    if (typeof si.currentLoad === "function") {
      const load = await si.currentLoad();
      metrics.cpu_percent = clampPercent(load.currentLoad ?? 0);
    }
    if (typeof si.mem === "function") {
      const mem = await si.mem();
      const used = mem.active ?? mem.used ?? 0;
      const total = mem.total ?? 0;
      metrics.ram_percent = total > 0 ? clampPercent((used / total) * 100) : 0;
    }
    if (typeof si.fsSize === "function") {
      const fsSizes = await si.fsSize();
      const root = Array.isArray(fsSizes) && fsSizes.length > 0 ? (fsSizes[0]?.use ?? 0) : 0;
      metrics.disk_percent = clampPercent(root);
    }
  } catch (e) {
    // Missing/unusable `systeminformation` mirrors Python's `except ImportError: pass`.
    logDebug(`[Awareness] systeminformation unavailable: ${errText(e)}`);
  }
  return metrics;
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Number(n.toFixed(1))));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Active window title / clipboard
 * ──────────────────────────────────────────────────────────────────────────── */

/** Run a short-lived helper command, returning stdout or "" (never throws). */
function tryExec(file: string, args: string[], timeoutMs = 2000): string {
  try {
    const out = execFileSync(file, args, {
      timeout: timeoutMs,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Buffer.isBuffer(out) ? out.toString("utf8") : String(out);
  } catch {
    return "";
  }
}

const WIN_FOREGROUND_PS =
  "Add-Type -Namespace W -Name N -MemberDefinition '" +
  '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();' +
  '[DllImport("user32.dll")] public static extern int GetWindowTextLength(System.IntPtr h);' +
  '[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);' +
  "';" +
  "$h=[W.N]::GetForegroundWindow();" +
  "$len=[W.N]::GetWindowTextLength($h);" +
  "$sb=New-Object System.Text.StringBuilder ($len+1);" +
  "[void][W.N]::GetWindowText($h,$sb,$len+1);" +
  "[Console]::Out.Write($sb.ToString())";

/**
 * Best-effort active window title.
 *
 * TODO(port): Python used `ctypes.windll.user32` on Windows, `osascript` on
 * macOS and `xdotool` on Linux. There is no synchronous Win32 binding here, so
 * Windows shells out to PowerShell. The "return '' on any failure" contract is
 * preserved exactly.
 */
export function get_active_window_title(): string {
  try {
    switch (os.platform()) {
      case "win32":
        return tryExec("powershell", ["-NoProfile", "-c", WIN_FOREGROUND_PS]).trim();
      case "darwin":
        return tryExec("osascript", [
          "-e",
          'tell application "System Events" to get name of first process whose frontmost is true',
        ]).trim();
      default: {
        const xdotool = whichSync("xdotool");
        if (xdotool) return tryExec(xdotool, ["getactivewindow", "getwindowname"]).trim();
        const xprop = whichSync("xprop");
        if (xprop) {
          const line = tryExec(xprop, ["-root", "_NET_ACTIVE_WINDOW"]).split("\n")[0] ?? "";
          const id = line.split("#")[1]?.trim();
          if (id) {
            const name = tryExec(xprop, ["-id", id, "_NET_WM_NAME", "WM_NAME"]);
            const match = /=\s*"?(.*?)"?\s*$/.exec(name.split("\n")[0] ?? "");
            return (match?.[1] ?? "").trim();
          }
        }
        return "";
      }
    }
  } catch {
    return "";
  }
}

export function getActiveWindowTitle(): string {
  return get_active_window_title();
}

/**
 * Get clipboard content (capped at 500 chars, as in Python).
 *
 * TODO(port): Python used `win32clipboard`, then `pbpaste` / `xclip`. Windows
 * now shells out to PowerShell `Get-Clipboard`; any failure yields "".
 */
export function get_clipboard(): string {
  try {
    switch (os.platform()) {
      case "win32":
        return tryExec("powershell", ["-NoProfile", "-c", "Get-Clipboard -Raw"]).slice(0, 500);
      case "darwin":
        return tryExec("pbpaste", []).slice(0, 500);
      default: {
        const xclip = whichSync("xclip");
        if (xclip) return tryExec(xclip, ["-selection", "clipboard", "-o"]).slice(0, 500);
        const wlPaste = whichSync("wl-paste");
        if (wlPaste) return tryExec(wlPaste, ["-n"]).slice(0, 500);
        return "";
      }
    }
  } catch {
    return "";
  }
}

export function getClipboard(): string {
  return get_clipboard();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Screenshot + OCR
 * ──────────────────────────────────────────────────────────────────────────── */

export const OCR_UNAVAILABLE_ERROR =
  "[OCR unavailable — the `tesseract` binary was not found on PATH. Install it " +
  "(winget install UB-Mannheim.TesseractOCR, brew install tesseract, " +
  "apt install tesseract-ocr) or set TESSERACT_BIN. pytesseract does exactly the " +
  "same shell-out in Python.]";

export const SCREENSHOT_UNAVAILABLE_ERROR =
  "[ERROR] screenshot unavailable — the `screenshot-desktop` package is not installed.";

/** Locate the tesseract binary (PATH first, then the usual install spots). */
export function findTesseract(): string | null {
  const fromEnv = process.env.TESSERACT_BIN;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const onPath = whichSync("tesseract");
  if (onPath) return onPath;
  const candidates =
    os.platform() === "win32"
      ? [
          "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
          "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
          path.join(
            os.homedir(),
            "AppData",
            "Local",
            "Programs",
            "Tesseract-OCR",
            "tesseract.exe",
          ),
        ]
      : ["/usr/bin/tesseract", "/usr/local/bin/tesseract", "/opt/homebrew/bin/tesseract"];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Capture the screen as PNG bytes, or null when capture is unavailable. */
export async function captureScreen(display?: number): Promise<Buffer | null> {
  const shot = await getScreenshot();
  if (!shot) {
    logDebug(SCREENSHOT_UNAVAILABLE_ERROR);
    return null;
  }
  try {
    return await shot(display === undefined ? {} : { screen: display });
  } catch (e) {
    logDebug(`[Awareness] screenshot failed: ${errText(e)}`);
    return null;
  }
}

/**
 * OCR an image buffer through the `tesseract` binary.
 *
 * TODO(port): `pytesseract` (NOT available for Node) is itself a thin wrapper
 * around this binary, so the port calls it directly via node:child_process.
 * No `tesseract.js` dependency is needed or available.
 */
export async function ocrImage(image: Buffer): Promise<string> {
  const bin = findTesseract();
  if (!bin) {
    logDebug(OCR_UNAVAILABLE_ERROR);
    return OCR_UNAVAILABLE_ERROR;
  }
  const tmp = path.join(
    os.tmpdir(),
    `axoniz-ocr-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`,
  );
  try {
    fs.writeFileSync(tmp, image);
    const { stdout, code } = await runProcess(bin, [tmp, "stdout"], 30_000);
    if (code !== 0 && !stdout) return `[OCR error: tesseract exited with code ${code}]`;
    return stdout.slice(0, 1000);
  } catch (e) {
    return `[OCR error: ${errText(e)}]`;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best effort */
    }
  }
}

/** Region of the screen, in physical pixels. */
export interface ScreenRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Crop + normalise a PNG buffer with `sharp` (falls back to passthrough). */
export async function cropAndPreprocess(image: Buffer, region: ScreenRegion): Promise<Buffer> {
  const sharp = await getSharp();
  if (!sharp) {
    logDebug("[Awareness] sharp unavailable — using the uncropped screenshot");
    return image;
  }
  try {
    return await sharp(image)
      .extract({
        left: Math.max(0, Math.round(region.left)),
        top: Math.max(0, Math.round(region.top)),
        width: Math.max(1, Math.round(region.width)),
        height: Math.max(1, Math.round(region.height)),
      })
      .grayscale()
      .normalize()
      .png()
      .toBuffer();
  } catch (e) {
    logDebug(`[Awareness] sharp crop failed: ${errText(e)}`);
    return image;
  }
}

/**
 * Take a screenshot and OCR it. Returns the extracted text, or a bracketed
 * status string matching the Python contract:
 *   "[OCR unavailable — …]" / "[Screenshot unavailable — …]" / "[Screenshot error: …]"
 */
export async function take_screenshot_ocr(region?: ScreenRegion): Promise<string> {
  let image = await captureScreen();
  if (!image) {
    return (await getScreenshot()) ? "[Screenshot error: capture failed]" : SCREENSHOT_UNAVAILABLE_ERROR;
  }
  if (region) image = await cropAndPreprocess(image, region);
  return ocrImage(image);
}

export async function takeScreenshotOcr(region?: ScreenRegion): Promise<string> {
  return take_screenshot_ocr(region);
}

export interface TextFound {
  found: boolean;
  region?: ScreenRegion;
  line?: string;
  error?: string;
}

/**
 * Find a piece of text on screen by OCR-ing horizontal tiles and matching the
 * line containing it. This is the "screen watching / text finding" capability
 * that the Python stack reached through `pyautogui` + `pytesseract`.
 */
export async function findTextOnScreen(
  needle: string,
  tileHeight = 400,
  display?: number,
): Promise<TextFound> {
  const image = await captureScreen(display);
  if (!image) {
    return {
      found: false,
      error: (await getScreenshot())
        ? "[Screenshot error: capture failed]"
        : SCREENSHOT_UNAVAILABLE_ERROR,
    };
  }

  const sharp = await getSharp();
  let height = 0;
  if (sharp) {
    try {
      const meta = await sharp(image).metadata();
      height = meta.height ?? 0;
    } catch {
      height = 0;
    }
  }

  const scan = async (tile: Buffer, top: number, tileH: number): Promise<TextFound | null> => {
    const text = await ocrImage(tile);
    if (text.startsWith("[OCR unavailable")) return { found: false, error: text };
    const line = text
      .split("\n")
      .find((l) => l.toLowerCase().includes(needle.toLowerCase()));
    if (!line) return null;
    return {
      found: true,
      region: { left: 0, top, width: 0, height: tileH },
      line: line.trim(),
    };
  };

  if (height <= 0) {
    const result = await scan(image, 0, 0);
    return result ?? { found: false };
  }

  for (let top = 0; top < height; top += tileHeight) {
    const tileH = Math.min(tileHeight, height - top);
    const tile = await cropAndPreprocess(image, {
      left: 0,
      top,
      width: 100_000,
      height: tileH,
    });
    const result = await scan(tile, top, tileH);
    if (result) return result;
  }
  return { found: false };
}

export async function find_text_on_screen(
  needle: string,
  tileHeight = 400,
  display?: number,
): Promise<TextFound> {
  return findTextOnScreen(needle, tileHeight, display);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Context snapshot
 * ──────────────────────────────────────────────────────────────────────────── */

/** Point-in-time awareness snapshot. */
export class ContextSnapshot {
  ts: number;
  window_title: string;
  clipboard: string;
  metrics: SystemMetrics;
  ocr_text: string;
  suggestions: string[];

  constructor() {
    this.ts = Date.now() / 1000;
    this.window_title = "";
    this.clipboard = "";
    this.metrics = { cpu_percent: 0, ram_percent: 0, disk_percent: 0, platform: osName() };
    this.ocr_text = "";
    this.suggestions = [];
  }

  /** camelCase aliases for the Python attribute names. */
  get windowTitle(): string {
    return this.window_title;
  }

  get ocrText(): string {
    return this.ocr_text;
  }

  to_dict(): Record<string, unknown> {
    return {
      ts: this.ts,
      window: this.window_title,
      clipboard: this.clipboard.slice(0, 100),
      cpu: this.metrics["cpu_percent"] ?? 0,
      ram: this.metrics["ram_percent"] ?? 0,
      suggestions: this.suggestions,
    };
  }

  toDict(): Record<string, unknown> {
    return this.to_dict();
  }

  /** Format as an agent context block. */
  context_block(): string {
    const lines: string[] = [];
    if (this.window_title) lines.push(`Active window: ${this.window_title}`);
    const cpu = Number(this.metrics["cpu_percent"] ?? 0);
    const ram = Number(this.metrics["ram_percent"] ?? 0);
    if (cpu > 80) lines.push(`⚠ CPU ${cpu.toFixed(0)}% — system under load`);
    if (ram > 85) lines.push(`⚠ RAM ${ram.toFixed(0)}% — memory pressure`);
    if (this.suggestions.length > 0) {
      lines.push("Proactive suggestions:");
      for (const s of this.suggestions) lines.push(`  • ${s}`);
    }
    return lines.length > 0 ? lines.join("\n") : "";
  }

  contextBlock(): string {
    return this.context_block();
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Suggestion engine
 * ──────────────────────────────────────────────────────────────────────────── */

type SuggestionRule = [condition: (s: ContextSnapshot) => boolean, suggestion: string];

/**
 * Rule-based proactive suggestion generator.
 * Looks at context and fires suggestions to the user.
 */
export class SuggestionEngine {
  private _rules: SuggestionRule[];

  constructor() {
    this._rules = [
      // (condition_fn, suggestion_str)
      [
        (s) =>
          s.window_title.toLowerCase().includes("github.com") ||
          s.window_title.toLowerCase().includes("git"),
        "Looks like you're on GitHub — want me to summarize recent changes?",
      ],
      [
        (s) => s.window_title.toLowerCase().includes("stackoverflow"),
        "Stack Overflow detected — want me to search for a solution?",
      ],
      [
        (s) => Number(s.metrics["cpu_percent"] ?? 0) > 85,
        "CPU is pegged — want me to identify what's eating compute?",
      ],
      [
        (s) => Number(s.metrics["ram_percent"] ?? 0) > 90,
        "Memory critical — want me to find large processes?",
      ],
      [
        (s) =>
          ["error", "traceback", "exception"].some((kw) =>
            s.clipboard.toLowerCase().includes(kw),
          ),
        "Saw an error in your clipboard — want me to diagnose it?",
      ],
      [
        (s) => ["http://", "https://"].some((kw) => s.clipboard.toLowerCase().includes(kw)),
        "URL detected in clipboard — want me to summarize that page?",
      ],
      [
        (s) =>
          ["python", ".py", "vscode", "pycharm", "typescript", ".ts"].some((kw) =>
            s.window_title.toLowerCase().includes(kw),
          ),
        "Coding detected — want me to review what you're working on?",
      ],
    ];
  }

  evaluate(snapshot: ContextSnapshot): string[] {
    const suggestions: string[] = [];
    for (const [condition, suggestion] of this._rules) {
      try {
        if (condition(snapshot)) suggestions.push(suggestion);
      } catch {
        /* a broken rule must never kill the loop */
      }
    }
    return suggestions.slice(0, 3); // cap at 3
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Main service
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AwarenessStatus {
  running: boolean;
  last_snapshot: Record<string, unknown> | null;
}

/**
 * Background service that monitors context and delivers proactive suggestions.
 *
 * TODO(port): Python used `threading.Thread(daemon=True)` + `time.sleep`.
 * This is a cancellable async loop; `stop()` aborts the sleep immediately.
 */
export class AwarenessService {
  interval_s: number;
  enable_ocr: boolean;

  private _suggester = new SuggestionEngine();
  private _running = false;
  private _abort: AbortController | null = null;
  private _thread: Promise<void> | null = null;
  private _last: ContextSnapshot | null = null;
  private _on_suggestion: ((s: string) => void) | null = null;
  private _last_window = "";
  private _last_clip = "";

  constructor(interval_s = 60, enable_ocr = false) {
    this.interval_s = interval_s;
    this.enable_ocr = enable_ocr;
  }

  /** Called when AXONIZ has a proactive suggestion. */
  set_suggestion_callback(cb: (s: string) => void): void {
    this._on_suggestion = cb;
  }

  setSuggestionCallback(cb: (s: string) => void): void {
    this.set_suggestion_callback(cb);
  }

  /** Take a single context snapshot. */
  async snapshot(): Promise<ContextSnapshot> {
    const s = new ContextSnapshot();
    s.window_title = get_active_window_title();
    s.metrics = await getSystemMetricsAsync();
    s.clipboard = get_clipboard();
    if (this.enable_ocr) {
      s.ocr_text = await take_screenshot_ocr();
    }
    s.suggestions = this._suggester.evaluate(s);
    this._last = s;
    return s;
  }

  /** Snapshot without the async metrics refresh (sync Python signature parity). */
  snapshot_sync(): ContextSnapshot {
    const s = new ContextSnapshot();
    s.window_title = get_active_window_title();
    s.metrics = get_system_metrics();
    s.clipboard = get_clipboard();
    if (this.enable_ocr) {
      s.ocr_text = "[OCR is async in the Node port — await snapshot() instead]";
    }
    s.suggestions = this._suggester.evaluate(s);
    this._last = s;
    return s;
  }

  /** For injecting into the agent system prompt. */
  get_context_block(): string {
    if (this._last === null) {
      try {
        return this.snapshot_sync().context_block();
      } catch {
        return "";
      }
    }
    return this._last.context_block();
  }

  getContextBlock(): string {
    return this.get_context_block();
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._abort = new AbortController();
    const signal = this._abort.signal;
    this._thread = this._loop(signal)
      .catch((e: unknown) => {
        logger.error(`[Awareness] loop crashed: ${errText(e)}`);
      })
      .finally(() => {
        this._thread = null;
      });
    logInfo(`[Awareness] Service started (interval=${this.interval_s}s)`);
  }

  stop(): void {
    this._running = false;
    this._abort?.abort();
    this._abort = null;
  }

  is_running(): boolean {
    return this._running;
  }

  isRunning(): boolean {
    return this.is_running();
  }

  private async _loop(signal: AbortSignal): Promise<void> {
    while (this._running && !signal.aborted) {
      try {
        const s = await this.snapshot();
        this._check_changes(s);
      } catch (e) {
        logger.debug(`Awareness tick error: ${errText(e)}`);
      }
      await interruptibleSleep(this.interval_s * 1000, signal);
    }
  }

  private _check_changes(s: ContextSnapshot): void {
    // Notify on new suggestions only when context has meaningfully changed.
    if (
      s.window_title !== this._last_window ||
      s.clipboard.slice(0, 50) !== this._last_clip.slice(0, 50)
    ) {
      this._last_window = s.window_title;
      this._last_clip = s.clipboard;
      if (s.suggestions.length > 0 && this._on_suggestion) {
        for (const suggestion of s.suggestions.slice(0, 1)) {
          // one at a time
          try {
            this._on_suggestion(suggestion);
          } catch {
            /* callback errors must never break the loop */
          }
        }
      }
    }
  }

  status(): AwarenessStatus {
    if (!this._last) return { running: this._running, last_snapshot: null };
    return {
      running: this._running,
      last_snapshot: this._last.to_dict(),
    };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Singleton
 * ──────────────────────────────────────────────────────────────────────────── */

let _service: AwarenessService | null = null;

export function get_awareness_service(interval_s = 60): AwarenessService {
  if (_service === null) {
    try {
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      const acfg = (cfg["awareness"] ?? {}) as Record<string, unknown>;
      _service = new AwarenessService(
        Number(acfg["interval_s"] ?? interval_s),
        Boolean(acfg["enable_ocr"] ?? false),
      );
    } catch {
      _service = new AwarenessService(interval_s);
    }
  }
  return _service;
}

/** camelCase alias of `get_awareness_service`. */
export const getAwarenessService = get_awareness_service;

/** Test/DI hook — replace the singleton. */
export function setAwarenessService(service: AwarenessService | null): void {
  _service = service;
}

/* ────────────────────────────────────────────────────────────────────────────
 * helpers
 * ──────────────────────────────────────────────────────────────────────────── */

function runProcess(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (code: number): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* best effort */
      }
      finish(-1);
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (e: Error) => {
      stderr += String(e);
      finish(-1);
    });
    child.on("close", (code: number | null) => finish(code ?? -1));
  });
}

function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
