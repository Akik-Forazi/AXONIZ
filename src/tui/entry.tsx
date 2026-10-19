#!/usr/bin/env node
/**
 * AXONIZ TUI entry point — renders the gemini-cli UI (copied source)
 * with AXONIZ's agent backend wired in.
 *
 * No external install needed. The gemini-cli UI source code lives in
 * src/tui/ — 402 files copied from Google's repo. This entry point:
 *
 *   1. Creates an AXONIZ Agent from ~/.axoniz/config.json
 *   2. Overrides the streaming hook to call agent.chatStream()
 *   3. Renders the gemini-cli App.tsx (Google's actual component tree)
 *
 * The UI looks EXACTLY like gemini-cli but streams from AXONIZ's
 * providers (orca, openrouter, openai, lmstudio, etc.) instead of
 * Google's API.
 *
 * Usage:
 *   node dist/tui/entry.js --provider orca
 */
import React from "react";
import { render } from "ink";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// ── Load AXONIZ agent from dist/ ──
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..");
const esmRequire = createRequire(import.meta.url);

function loadAgent(): any {
  // Read --provider override from CLI args
  const args = process.argv.slice(2);
  let providerOverride: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      providerOverride = args[i + 1];
      i++;
    }
  }

  // Load config
  const { loadConfig } = esmRequire(path.join(DIST, "core", "config.js"));
  const config = loadConfig();

  // Apply provider override
  if (providerOverride) {
    (config as Record<string, unknown>).provider = providerOverride;
    (config as Record<string, unknown>).backend = providerOverride;
    const llm = (config as Record<string, unknown>).llm as Record<string, unknown> | undefined;
    if (llm) llm.active_provider = providerOverride;
    // Disable daemon on cloud
    const cloud = ["orca", "openrouter", "openai", "anthropic", "gemini", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity"];
    if (cloud.includes(providerOverride)) {
      const daemon = (config as Record<string, unknown>).daemon as Record<string, unknown> | undefined;
      if (daemon) daemon.enabled = false;
      else (config as Record<string, unknown>).daemon = { enabled: false };
      (config as Record<string, unknown>).awareness = { enabled: false };
    }
  }

  // Create agent
  const { Agent } = esmRequire(path.join(DIST, "core", "agent.js"));
  return new Agent(config);
}

// ── Create the agent ──
const agent = loadAgent();

// ── Patch the core-shim to wire AXONIZ agent into the streaming hook ──
// The gemini-cli UI's useAgentStream hook calls the Gemini API.
// We replace it with agent.chatStream() which streams from any provider.
const coreShim = await import("./core-shim.js");
// Monkey-patch: when the UI asks for a streaming response, call AXONIZ's agent
(coreShim as any).axonizAgent = agent;
(coreShim as any).streamAgent = async function* (message: string): AsyncGenerator<string> {
  for await (const token of agent.chatStream(message)) {
    yield token;
  }
};

// ── Render the gemini-cli App ──
// This is Google's actual component tree — App.tsx → DefaultAppLayout →
// MainContent + Composer → InputPrompt + Footer.
const { App } = await import("./App.js");
const instance = render(React.createElement(App));

// Keep the process alive
instance.waitUntilExit?.();
