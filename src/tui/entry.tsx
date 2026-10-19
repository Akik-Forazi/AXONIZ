#!/usr/bin/env node
/**
 * AXONIZ TUI entry point — renders the UI with AXONIZ's real agent runtime.
 *
 * This is NOT a gemini-cli wrapper. The UI source code (originally derived
 * from gemini-cli) is adapted to use AXONIZ's:
 *   - Agent (chatStream, run, exec, switchModel, switchBackend, health, reset)
 *   - Config (loadConfig, saveConfig, activeProvider)
 *   - Slash commands (handleSlash from core/cli.ts)
 *   - Tool registry (agent.availableTools, agent.exec)
 *   - Provider catalog (PROVIDER_CATALOG from core/cli.ts)
 *
 * Usage:
 *   node dist/tui/entry.js --provider orca
 *   node dist/tui/entry.js --provider lmstudio
 */
import React from "react";
import { render } from "ink";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// ── Resolve dist/ path for the compiled AXONIZ runtime ──
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..");
const esmRequire = createRequire(import.meta.url);

function loadAxonizConfig(): Record<string, unknown> {
  const { loadConfig } = esmRequire(path.join(DIST, "core", "config.js"));
  return loadConfig();
}

function createAgent(config: Record<string, unknown>): any {
  const { Agent } = esmRequire(path.join(DIST, "core", "agent.js"));
  return new Agent(config);
}

async function main() {
  // ── Parse --provider override ──
  const args = process.argv.slice(2);
  let providerOverride: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      providerOverride = args[i + 1];
      break;
    }
  }

  // ── Load + mutate config ──
  const config = loadAxonizConfig();
  if (providerOverride) {
    config.provider = providerOverride;
    config.backend = providerOverride;
    const llm = config.llm as Record<string, unknown> | undefined;
    if (llm) llm.active_provider = providerOverride;
    // Disable daemon + awareness on cloud
    const cloud = ["orca", "openrouter", "openai", "anthropic", "gemini", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity"];
    if (cloud.includes(providerOverride)) {
      const daemon = config.daemon as Record<string, unknown> | undefined;
      if (daemon) daemon.enabled = false;
      else config.daemon = { enabled: false };
      config.awareness = { enabled: false };
    }
  }

  // ── Create real AXONIZ Agent ──
  const agent = createAgent(config);

  // ── Import the AXONIZ adapters ──
  const { AxonizAgentProtocol } = await import("./axoniz-agent-protocol.js");
  const { AxonizConfigAdapter } = await import("./axoniz-config.js");

  // ── Create adapters ──
  const agentProtocol = new AxonizAgentProtocol(agent);
  const configAdapter = new AxonizConfigAdapter(config);

  // ── Patch core-shim with real adapters via mutable container ──
  // ESM exports are frozen — can't monkey-patch. Instead, use the
  // _axonizRuntime container that core-shim reads from.
  const coreShim = await import("./core-shim.js");
  coreShim._axonizRuntime.config = configAdapter;
  coreShim._axonizRuntime.agent = agent;
  coreShim._axonizRuntime.agentProtocol = agentProtocol;

  // ── Render the UI ──
  // Render AppContainer (not App) — AppContainer provides all the
  // context providers (UIStateContext, ConfigContext, etc.) that the
  // UI components need. App is just a thin picker that calls useUIState()
  // which throws without a provider.
  const { AppContainer } = await import("./AppContainer.js");
  const instance = render(
    React.createElement(AppContainer, {
      // Pass the real AXONIZ agent + config as props if AppContainer accepts them
      // (it might not — in that case the coreShim patches above handle it)
    }),
  );

  // Keep the process alive
  if (instance.waitUntilExit) {
    await instance.waitUntilExit();
  }
}

void main();
