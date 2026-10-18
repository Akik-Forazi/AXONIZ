/**
 * AXONIZ-ZERO — CLI entry point.
 * Equivalent to `axoniz_main.py` / the console_scripts entry in setup.py.
 *
 * Usage:
 *   axoniz --web          # web UI at http://localhost:7860
 *   axoniz --lc           # interactive REPL
 *   axoniz --cli          # one-shot task
 *   axoniz --goal "..."   # autonomous goal mode
 *
 * This wrapper installs a stderr filter BEFORE importing the rest of the
 * agent so that node-llama-cpp's noisy yellow warnings
 * ("WARN: token </s> type mismatch") and similar debug chatter from
 * native dependencies don't bleed into the REPL experience.
 */
import "dotenv/config";
import process from "node:process";
import { main } from "../core/runner.js";
import { getLogger } from "../core/logger.js";

/* ── Stderr noise filter ────────────────────────────────────────────────────
 *
 * node-llama-cpp prints yellow ANSI warnings like:
 *   \u001b[33mWARN: token </s> type mismatch\u001b[0m
 *
 * These warnings are confusing to users — they look like AXONIZ errors
 * but they're model-template quirks. The filter:
 *   1. Matches lines starting with WARN: or [WARN] or with ANSI yellow color.
 *   2. Suppresses them by default (set AXONIZ_DEBUG=1 to see them).
 *   3. Forwards everything else untouched.
 *
 * We also strip the legacy "(Ctrl-C — type exit to quit)" reminder that
 * the readline SIGINT handler used to spam.
 */
const NOISE_PATTERNS = [
  /^\u001b\[33mWARN:/,                        // yellow WARN: lines (node-llama-cpp)
  /^\u001b\[33m.*token.*mismatch/i,           // any yellow line about token mismatch
  /^\u001b\[33m.*\bbpe\b/i,                   // BPE encoding warnings
  /^\[WARN\]/i,                              // [WARN] prefix
  /^\[node-llama-cpp\]/i,                    // node-llama-cpp prefix
  /^\[gpt-2\]/i,                              // gpt-2 tokenizer warnings
  /^\[llama-internal\]/i,                    // llama.cpp internal warnings
];

const originalStderrWrite = process.stderr.write.bind(process.stderr);

function filteredStderrWrite(chunk: string | Uint8Array, ...args: unknown[]): boolean {
  if (typeof chunk === "string") {
    const lines = chunk.split("\n");
    const filtered = lines.filter((line) => {
      if (process.env.AXONIZ_DEBUG) return true;  // debug mode = pass everything
      return !NOISE_PATTERNS.some((p) => p.test(line));
    });
    if (filtered.length === 0) return true;  // swallowed all lines
    chunk = filtered.join("\n");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (originalStderrWrite as any)(chunk, ...args as any[]);
}

process.stderr.write = filteredStderrWrite as typeof process.stderr.write;

/* ── Main ─────────────────────────────────────────────────────────────────── */

async function run(): Promise<void> {
  try {
    await main(process.argv.slice(2));
  } catch (e) {
    getLogger().error(
      `[FATAL] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
    );
    process.exitCode = 1;
  } finally {
    // Flush structured/session logs before the process exits.
    try {
      getLogger().close();
    } catch {
      /* ignore */
    }
  }
}

void run();
