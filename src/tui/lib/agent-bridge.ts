/**
 * Agent bridge — connects the AXONIZ agent's chatStream() generator
 * to the React state in the TUI.
 *
 * Loads the compiled Agent class from <repo>/dist/core/agent.js via
 * eval('require') (same pattern as web/src/lib/axoniz/cli-bridge.ts —
 * bypasses Turbopack's static module analysis so we can ship a
 * Next.js-friendly bundle that loads the CLI at runtime).
 *
 * The agent is created ONCE per TUI session — same Agent instance
 * is reused for every message in the session. Conversation history
 * accumulates inside the agent (via ChatHistory + memory palace).
 *
 * If the agent fails to load (dist/ not built) or fails to stream
 * (no API key, network error), the error is surfaced as a fake
 * assistant message so the user sees what went wrong instead of a
 * frozen UI.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// HERE = <repo>/dist/tui/lib  →  go up 3 levels to reach <repo>
// Then append "dist" to find the compiled CLI at <repo>/dist/
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "..", "..", "dist");

// createRequire lets ESM modules call CJS require() — needed because
// the compiled CLI at dist/core/agent.js is CommonJS (uses module.exports).
const esmRequire = createRequire(import.meta.url);

function distRequire(rel: string): any {
  const full = path.join(DIST, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`CLI not built: ${full} missing. Run "npm run build" in the project root.`);
  }
  return esmRequire(full);
}

export interface AgentBridge {
  exec(
    input: string,
    onToken: (token: string) => void,
    onDone: () => void,
  ): Promise<void>;
}

/** Load the config from ~/.axoniz/config.json (via the CLI's loadConfig). */
function loadConfig(): Record<string, unknown> {
  try {
    const mod = distRequire("core/config.js");
    return mod.loadConfig();
  } catch (e) {
    throw new Error(`Failed to load config: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Create the AXONIZ Agent with the current config. */
function createAgent(): any {
  const { Agent } = distRequire("core/agent.js");
  const config = loadConfig();
  // Apply --provider override from the CLI (entry.tsx sets the env var)
  const providerOverride = process.env.AXONIZ_PROVIDER_OVERRIDE;
  if (providerOverride) {
    (config as Record<string, unknown>).provider = providerOverride;
    (config as Record<string, unknown>).backend = providerOverride;
    const llm = (config as Record<string, unknown>).llm as Record<string, unknown> | undefined;
    if (llm) llm.active_provider = providerOverride;
    // Disable daemon + awareness when switching to a cloud provider
    const cloud = ["orca", "openrouter", "openai", "anthropic", "gemini", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity"];
    if (cloud.includes(providerOverride)) {
      const daemon = (config as Record<string, unknown>).daemon as Record<string, unknown> | undefined;
      if (daemon) daemon.enabled = false;
      (config as Record<string, unknown>).awareness = { enabled: false };
    }
  }
  return new Agent(config);
}

let _agent: any = null;
export function getAgent(): any {
  if (_agent === null) {
    _agent = createAgent();
  }
  return _agent;
}

/**
 * Real AgentBridge — calls agent.chatStream(input) and pipes the async
 * generator's tokens into the TUI's onToken callback.
 *
 * On error (no API key, network failure, dist missing), yields the
 * error message as a token so the user sees it in the chat log
 * instead of a frozen UI.
 */
export class AgentBridge implements AgentBridge {
  async exec(
    input: string,
    onToken: (token: string) => void,
    onDone: () => void,
  ): Promise<void> {
    try {
      const agent = getAgent();
      // chatStream yields tokens one at a time. Each token triggers
      // a React state update via onToken, which causes Ink to re-render
      // the MessageLog + Footer with the new content + token count.
      for await (const token of agent.chatStream(input)) {
        onToken(token);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onToken(`\n[ERROR] ${msg}`);
    } finally {
      onDone();
    }
  }
}
