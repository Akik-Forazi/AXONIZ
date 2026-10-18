#!/usr/bin/env node
/**
 * axoniz-tui — entry point for the Ink-based terminal UI.
 *
 * Usage:
 *   node dist/tui/entry.js          # start TUI with the real agent
 *   node dist/tui/entry.js --provider orca   # override provider
 *
 * This is the Ink equivalent of gemini-cli's packages/cli/src/index.ts.
 * Renders a React tree to the terminal via Ink with:
 *   - Live input box at the bottom (not blocking like readline)
 *   - Slash command autocomplete dropdown (coming next)
 *   - Up/down arrow history navigation (coming next)
 *   - Real-time footer updates (tokens + elapsed)
 *   - Animated braille-dot spinner
 *
 * The real Agent is loaded from <repo>/dist/core/agent.js — same compiled
 * CLI the `axoniz --lc` command uses. Tokens stream directly from the
 * LLM via agent.chatStream() → Ink re-renders.
 */
import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { AgentBridge } from "./lib/agent-bridge.js";

// Allow --provider override on the CLI (same as `axoniz --lc --provider orca`)
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--provider" && args[i + 1]) {
    process.env.AXONIZ_PROVIDER_OVERRIDE = args[i + 1];
    i++;
  }
}

const bridge = new AgentBridge();
const { waitUntilExit } = render(React.createElement(App, { agentBridge: bridge }));

await waitUntilExit();
