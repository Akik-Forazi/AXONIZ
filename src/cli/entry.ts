#!/usr/bin/env node
/**
 * AXONIZ-ZERO — CLI entry point.
 * Equivalent to `axoniz_main.py` / the console_scripts entry in setup.py.
 *
 * Usage:
 *   axoniz --web          # web UI at http://localhost:7860
 *   axoniz --lc           # interactive REPL
 *   axoniz --cli          # one-shot task
 *   axoniz --goal "..."   # autonomous goal mode
 */
import "dotenv/config";
import process from "node:process";
import { main } from "../core/runner.js";
import { getLogger } from "../core/logger.js";

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
