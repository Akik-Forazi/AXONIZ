/**
 * Axodex Native Tools — graph-powered code intelligence (TypeScript port).
 *
 * Connects AXONIZ to the Axodex graph index CLI. Resolves the CLI in
 * priority order:
 *
 *   1. BUNDLED axodex built dist at
 *      <repo>/axoniz/integrations/Axodex/axodex/dist/cli/index.js
 *      (run via `node`)
 *
 *   2. BUNDLED axodex TypeScript source at
 *      <repo>/axoniz/integrations/Axodex/axodex/src/cli/index.ts
 *      (run via `bun` if available, else `npx tsx`)
 *
 *   3. PACKAGED (PyInstaller / pkg / Node SEA) bundled axodex from
 *      `process.resourcesPath/integrations/Axodex/axodex/dist/cli/index.js`
 *
 *   4. USER HOME `~/.axoniz/integrations/Axodex/axodex/dist/cli/index.js`
 *      (legacy fallback)
 *
 *   5. GLOBAL `npx axodex` (last resort — requires user to have installed
 *      axodex globally; AXONIZ logs a clear warning if it falls through
 *      to this branch)
 *
 * No `axoniz install axodex` step is required — the bundled source is
 * always preferred and runs directly via `bun`/`tsx` so no build step
 * is needed either.
 *
 * Ported from `axoniz/tools/axodex_tools.py`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { error, info } from "../core/debug.js";
import { errText, resolveCommand, runCaptured } from "./_internal.js";

/* ── engine discovery ─────────────────────────────────────────────────────── */

/** Repo root: this file lives at src/tools/axodex_tools.ts, so ../.. is repo root. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

/** Bundled axodex integration root inside the AXONIZ repo. */
export const AXODEX_BUNDLED_ROOT = path.join(
  REPO_ROOT,
  "axoniz",
  "integrations",
  "Axodex",
  "axodex",
);

/** Built CLI entry (preferred — fastest, no runtime transpile). */
export const AXODEX_BUNDLED_CLI_DIST = path.join(
  AXODEX_BUNDLED_ROOT,
  "dist",
  "cli",
  "index.js",
);

/** TypeScript source CLI entry (works without a build step via bun/tsx). */
export const AXODEX_BUNDLED_CLI_SRC = path.join(
  AXODEX_BUNDLED_ROOT,
  "src",
  "cli",
  "index.ts",
);

/** User-home fallback for PyInstaller/pkg/SEA scenarios where REPO_ROOT
 *  is not on disk (the executable's resourcesPath takes over). */
export const AXODEX_HOME_ROOT = path.join(
  os.homedir(),
  ".axoniz",
  "integrations",
  "Axodex",
  "axodex",
);

/** Legacy exported constants (kept for backwards-compat with any caller
 *  that imported them). */
export const AXODEX_ROOT = AXODEX_BUNDLED_ROOT;
export const AXODEX_CLI = AXODEX_BUNDLED_CLI_DIST;

/** Node equivalent of `getattr(sys, "frozen", False)` for bundled executables. */
function isPackaged(): boolean {
  const p = process as NodeJS.Process & { pkg?: unknown };
  return Boolean(p.pkg) || Boolean(process.env.PKG_EXECPATH);
}

/** `process.resourcesPath` (Electron/Node SEA) is absent from @types/node. */
function packagedResourcesPath(): string | null {
  const rp = (process as NodeJS.Process & { resourcesPath?: unknown })
    .resourcesPath;
  return typeof rp === "string" && rp.length > 0 ? rp : null;
}

/**
 * Resolved axodex invocation. The `cmd` is the argv prefix to prepend to
 * any user-supplied args (e.g. ["axodex", "query", "foo"] or
 * ["node", "/path/to/dist/cli/index.js", "query", "foo"]).
 *
 * `via` is a human-readable hint for log lines ("bundled-dist" |
 * "bundled-src-via-bun" | "bundled-src-via-tsx" | "home-dist" |
 * "npx-global").
 */
interface AxodexInvocation {
  cmd: string[];
  via: string;
}

let cachedInvocation: AxodexInvocation | null = null;

/**
 * Find the best way to invoke axodex right now. Memoized per-process so
 * repeated calls don't re-probe.
 */
export function resolveAxodex(): AxodexInvocation | null {
  if (cachedInvocation) return cachedInvocation;

  // 1. Bundled dist (preferred)
  if (fs.existsSync(AXODEX_BUNDLED_CLI_DIST)) {
    cachedInvocation = {
      cmd: [process.execPath, AXODEX_BUNDLED_CLI_DIST],
      via: "bundled-dist",
    };
    return cachedInvocation;
  }

  // 2. Bundled src — run via bun (fast, native) or tsx (slower but works)
  if (fs.existsSync(AXODEX_BUNDLED_CLI_SRC)) {
    const bunBin = resolveCommand("bun");
    if (bunBin) {
      cachedInvocation = {
        cmd: [bunBin, "run", AXODEX_BUNDLED_CLI_SRC],
        via: "bundled-src-via-bun",
      };
      return cachedInvocation;
    }
    const npxBin = resolveCommand("npx");
    if (npxBin) {
      cachedInvocation = {
        cmd: [npxBin, "tsx", AXODEX_BUNDLED_CLI_SRC],
        via: "bundled-src-via-tsx",
      };
      return cachedInvocation;
    }
    error(
      `[Axodex] Bundled source exists at ${AXODEX_BUNDLED_CLI_SRC} but neither 'bun' nor 'npx tsx' is available. Install bun (recommended) or run 'cd axoniz/integrations/Axodex/axodex && npm run build' to compile to dist/.`,
    );
  }

  // 3. Packaged (PyInstaller / pkg / Electron / Node SEA)
  if (isPackaged()) {
    const rp = packagedResourcesPath();
    if (rp) {
      const packagedDist = path.join(
        rp,
        "integrations",
        "Axodex",
        "axodex",
        "dist",
        "cli",
        "index.js",
      );
      if (fs.existsSync(packagedDist)) {
        cachedInvocation = {
          cmd: [process.execPath, packagedDist],
          via: "packaged-resources",
        };
        return cachedInvocation;
      }
    }
  }

  // 4. User-home fallback (legacy ~/.axoniz/integrations/Axodex/)
  const homeDist = path.join(AXODEX_HOME_ROOT, "dist", "cli", "index.js");
  if (fs.existsSync(homeDist)) {
    cachedInvocation = {
      cmd: [process.execPath, homeDist],
      via: "home-dist",
    };
    return cachedInvocation;
  }

  // 5. Global `npx axodex` (last resort)
  const npxBin = resolveCommand("npx");
  if (npxBin) {
    cachedInvocation = {
      cmd: [npxBin, "axodex"],
      via: "npx-global",
    };
    return cachedInvocation;
  }

  cachedInvocation = null;
  return null;
}

export class AxodexTools {
  readonly workspace: string;

  constructor(workspace = ".") {
    this.workspace = path.resolve(workspace);
    this._ensure_built();
  }

  /**
   * Resolve the axodex CLI. If nothing resolves, log a clear diagnostic
   * explaining where the bundled source lives and how to build it.
   */
  async _ensure_built(): Promise<void> {
    const inv = resolveAxodex();
    if (inv) {
      info(`[Axodex] resolved via ${inv.via}`);
      return;
    }
    error(
      `[Axodex] CLI not found.\n` +
        `  Bundled source expected at:  ${AXODEX_BUNDLED_CLI_SRC}\n` +
        `  Bundled dist expected at:    ${AXODEX_BUNDLED_CLI_DIST}\n` +
        `  Either install bun (recommended — runs the TS source directly),\n` +
        `  or build the dist with:  cd axoniz/integrations/Axodex/axodex && bun run build`,
    );
  }

  /** Best-effort probe to confirm axodex is actually invocable. */
  private async _probe(): Promise<number | null> {
    const inv = resolveAxodex();
    if (!inv) return null;
    try {
      const res = await runCaptured(quoteArgv([...inv.cmd, "--help"]), {
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
    const inv = resolveAxodex();
    if (!inv) {
      return (
        `[AXODEX ERROR] axodex CLI not found.\n` +
        `  Bundled source expected at:  ${AXODEX_BUNDLED_CLI_SRC}\n` +
        `  Install bun (recommended) or build with:  cd axoniz/integrations/Axodex/axodex && bun run build`
      );
    }
    const fullCmd: string[] = [...inv.cmd, ...cmd];
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
        return `[AXODEX ERROR] '${inv.cmd[0]}' not found. Install bun or build the dist.`;
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
