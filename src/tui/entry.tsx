#!/usr/bin/env node
/**
 * axoniz-tui — entry point for the Ink-based terminal UI.
 *
 * Usage:
 *   node dist/tui/entry.js          # start TUI with mock bridge (for testing)
 *   node dist/tui/entry.js --agent # start TUI with real agent
 *
 * This is the Ink equivalent of gemini-cli's packages/cli/src/index.ts.
 * Renders a React tree to the terminal via Ink, with:
 *   - Live input box at the bottom (not blocking like readline)
 *   - Slash command autocomplete dropdown
 *   - Up/down arrow history navigation
 *   - Real-time footer updates (tokens + elapsed)
 *   - Animated braille-dot spinner
 */
import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { MockBridge } from "./lib/agent-bridge.js";

const bridge = new MockBridge();
const { waitUntilExit } = render(React.createElement(App, { agentBridge: bridge }));

await waitUntilExit();
