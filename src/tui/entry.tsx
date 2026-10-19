#!/usr/bin/env node
/**
 * AXONIZ TUI — entry point.
 * Renders the AXONIZ terminal interface using Ink.
 * Uses the real AXONIZ agent runtime (agent.chatStream, agent.switchBackend, etc.)
 *
 * Usage:
 *   node dist/tui/entry.js
 *   node dist/tui/entry.js --provider orca
 */
import React from "react";
import { render } from "ink";
import { App } from "./App.js";

const instance = render(React.createElement(App));

if (instance.waitUntilExit) {
  instance.waitUntilExit().then(() => process.exit(0));
}
