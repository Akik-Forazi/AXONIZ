/**
 * Axodex Native Tools — graph-powered code intelligence (TypeScript port).
 *
 * Ported from `axoniz/tools/axodex_tools.py`. Connects AXONIZ to the Axodex
 * graph index CLI.
 *
 * Python-stdlib mapping:
 *   __file__-relative path juggling -> import.meta.url + the same `..` depth
 *     compensation the Python used (src/tools -> repo root, matching
 *     axoniz/tools -> repo root), so the resolved path is identical.
 *   os.path.expanduser("~/.axoniz/...") -> os.homedir()
 *   sys.frozen / sys._MEIPASS (PyInstaller) -> process.pkg / resourcesPath
 *     (the Node bundler equivalents)
 *   subprocess.run(check/capture) -> runCaptured (never throws)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { error } from "../core/debug.js";
import { errText, resolveCommand, runCaptured } from "./_internal.js";

/* ── engine discovery ─────────────────────────────────────────────────────── */

/** Path to the Axodex CLI entry point. */
const _localPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "integrations",
  "Axodex",
  "axodex",
);
const _globalPath = path.join(os.homedir(), ".axoniz", "integrations", "Axodex", "axodex");

/** Path Autonomousty: prefer a complete global install over the bundled copy. */
function _isValidEngine(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "dist", "cli", "index.js")) && fs.existsSync(path.join(dir, "node_modules"))
  );
}

const _bundledPath = (() => {
  const rp = packagedResourcesPath();
  return rp ? path.join(rp, "axoniz", "integrations", "Axodex", "axodex") : _localPath;
})();

export const AXODEX_ROOT: string = _isValidEngine(_globalPath)
  ? _globalPath
  : _isValidEngine(_localPath)
    ? _localPath
    : isPackaged()
      ? _bundledPath
      : _localPath;

export const AXODEX_CLI: string = path.join(AXODEX_ROOT, "dist", "cli", "index.js");

/** Node equivalent of `getattr(sys, "frozen", False)` for bundled executables. */
function isPackaged(): boolean {
  const p = process as NodeJS.Process & { pkg?: unknown };
  return Boolean(p.pkg) || Boolean(process.env.PKG_EXECPATH);
}

/** `process.resourcesPath` (Electron/Node SEA) is absent from @types/node. */
function packagedResourcesPath(): string | null {
  const rp = (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath;
  return typeof rp === "string" && rp.length > 0 ? rp : null;
}

export class AxodexTools {
  readonly workspace: string;

  constructor(workspace = ".") {
    this.workspace = path.resolve(workspace);
    this._ensure_built();
  }

  /**
   * Check that the Axodex CLI exists, else probe for a globally installed
   * `axodex`. Mirrors the Python guard, which ran `npx axodex --help` and
   * logged a diagnostic when that failed.
   */
  async _ensure_built(): Promise<void> {
    if (fs.existsSync(AXODEX_CLI)) return;
    if (resolveCommand("npx")) {
      try {
        if (await this._probe() === 0) return;
      } catch {
        /* not available */
      }
    }
    error(
      `[Axodex] CLI not found at ${AXODEX_CLI} and npx axodex is not available. Please ensure Axodex is installed.`,
    );
  }

  /** Best-effort `npx axodex --help`; resolves with the exit code. */
  private async _probe(): Promise<number | null> {
    const npx = resolveCommand("npx");
    if (!npx) return null;
    try {
      const res = await runCaptured(quoteArgv([npx, "axodex", "--help"]), {
        cwd: this.workspace,
        timeoutMs: 60_000,
      });
      return res.timedOut ? null : res.code;
    } catch {
      return null;
    }
  }

  /** Execute an axodex command and return stdout. */
  async _run(cmd: string[]): Promise<string> {
    const fullCmd: string[] = fs.existsSync(AXODEX_CLI)
      ? [process.execPath, AXODEX_CLI, ...cmd]
      : (() => {
          const npx = resolveCommand("npx");
          return npx ? [npx, "axodex", ...cmd] : [];
        })();
    if (fullCmd.length === 0) return "[AXODEX ERROR] 'node' not found. Please install Node.js.";
    try {
      const res = await runCaptured(quoteArgv(fullCmd), {
        cwd: this.workspace,
        timeoutMs: 120_000,
      });
      if (res.timedOut) return "[AXODEX ERROR] Operation timed out (120s).";
      if (res.code !== 0) {
        const errOut = res.stderr || res.stdout;
        if (errOut.includes("No indexed repositories found")) {
          return "[AXODEX ERROR] No index found. Run 'axodex_analyze' first.";
        }
        return `[AXODEX ERROR] ${errOut}`;
      }
      return res.stdout.trim();
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err && err.code === "ENOENT") {
        return "[AXODEX ERROR] 'node' not found. Please install Node.js.";
      }
      return `[AXODEX EXCEPTION] ${errText(e)}`;
    }
  }

  /**
   * Superior read: symbol definition plus its immediate graph neighbours —
   * roughly 10x the context of a plain read for the same token budget.
   */
  async smart_read(symbolName: string): Promise<string> {
    const ctx = await this.context(symbolName);
    if (ctx.includes("[AXODEX ERROR]")) return ctx;
    return `[Architectural Slice: ${symbolName}]\n${ctx}`;
  }

  /** Semantic search for concepts or execution flows. */
  async query(query: string, limit = 10): Promise<string> {
    return this._run(["query", query, "--limit", String(limit)]);
  }

  /** Get full context for a symbol (callers, callees, flows). */
  async context(name: string): Promise<string> {
    return this._run(["context", name]);
  }

  /** Analyze blast radius of changing a symbol. */
  async impact(target: string, direction = "upstream"): Promise<string> {
    return this._run(["impact", target, "--direction", direction]);
  }

  /** Verify which symbols and processes are affected by current edits. */
  async detect_changes(): Promise<string> {
    return this._run(["detect_changes"]);
  }

  /** Force a refresh of the codebase index. */
  async analyze(): Promise<string> {
    return this._run(["analyze"]);
  }

  /** Check index freshness and repo stats. */
  async status(): Promise<string> {
    return this._run(["status"]);
  }

  /** camelCase alias — `detect_changes` is kept verbatim for tool naming. */
  async detectChanges(): Promise<string> {
    return this.detect_changes();
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/**
 * Quote an argv for the platform shell. `runCaptured` goes through a shell, and
 * Axodex arguments (symbol names, queries) routinely contain spaces.
 */
function quoteArgv(argv: string[]): string {
  if (process.platform !== "win32") {
    return argv.map((s) => `'${s.replace(/'/g, "'\\''")}'`).join(" ");
  }
  // MSVCRT argv quoting: double backslashes that precede a quote and any
  // trailing backslash run, then wrap in double quotes.
  return argv
    .map((s) => `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`)
    .join(" ");
}
