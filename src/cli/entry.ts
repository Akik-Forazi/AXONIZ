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
 *   \u001b[33m\n\u001b[33mwarn: token 212 </s> is not a control-type token, ...
 *
 * These warnings are confusing to users — they look like AXONIZ errors
 * but they're model-template quirks. The filter:
 *   1. Matches yellow ANSI lines (starts with \u001b[33m)
 *   2. Matches lines containing "possibly model bug"
 *   3. Matches lines containing "not control-type" / "not a control-type token"
 *   4. Matches lines containing "token \d+ </s>" anywhere
 *   5. Forwards everything else untouched.
 *   6. Set AXONIZ_DEBUG=1 to see suppressed lines.
 */
const NOISE_PATTERNS = [
  /^\u001b\[33m/,                                // any yellow ANSI line
  /\bpossibly model bug\b/i,                     // "possibly model bug" anywhere
  /\bnot (?:a )?control[- ]type (?:token)?\b/i,  // "not control-type" / "not a control-type token"
  /\btoken \d+\s*<\/?s?>\b/i,                    // "token 212 </s>" anywhere
  /<\/?s?>\s+is not/i,                           // "</s> is not" anywhere
  /^\[WARN\]/i,                                  // [WARN] prefix
  /^\s*warn:/i,                                  // "warn:" prefix (lowercase)
  /^\[node-llama-cpp\]/i,                        // node-llama-cpp prefix
  /^\[gpt-2\]/i,                                  // gpt-2 tokenizer warnings
  /^\[llama-internal\]/i,                        // llama.cpp internal warnings
  /\bBPE\b/i,                                    // any BPE warning
  /\bGGUF\b.*\bwarning\b/i,                      // GGUF warnings
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
