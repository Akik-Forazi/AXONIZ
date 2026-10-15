/**
 * Execution Runner — picks up a queued execution and runs it to
 * completion using the CLI's Agent. Runs independently of any
 * HTTP request — the browser can disconnect and the execution
 * continues.
 *
 * For "chat" mode: uses Agent.chatStream() — streams tokens.
 * For "agent" mode: uses Agent.run() — full agent loop with tools.
 *
 * Each token is persisted via execution-manager.appendToken().
 * State transitions are persisted: queued → running → completed/failed.
 * Cancellation is checked between tokens.
 */

import {
  getExecution,
  transitionState,
  appendToken,
  appendEvent,
  isCancellationRequested,
} from "@/lib/axoniz/execution-manager";
import { streamAgentChat, execAgent, loadCliConfig } from "@/lib/axoniz/cli-bridge";

/**
 * Run a single execution to completion (or failure/cancellation).
 * Called by POST /api/axoniz/executions — does NOT block the HTTP
 * response. The browser can disconnect; the execution continues.
 */
export async function runExecution(executionId: string): Promise<void> {
  const exec = getExecution(executionId);
  if (!exec) throw new Error(`execution ${executionId} not found`);
  if (exec.state !== "queued") throw new Error(`execution ${executionId} is ${exec.state}, not queued`);

  // Transition: queued → running
  transitionState(executionId, "running");
  appendEvent(executionId, "state_change", { state: "running", ts: Date.now() / 1000 });

  // Load the CLI config to get provider info
  const cliConfig = loadCliConfig();
  const provider = (cliConfig as Record<string, unknown>)?.llm
    ? ((cliConfig as { llm: { active_provider: string } }).llm.active_provider)
    : exec.provider ?? "llamacpp";

  try {
    if (exec.mode === "agent") {
      // Full agent loop — tools, memory, swarm
      appendEvent(executionId, "thinking", { value: "running agent loop…", ts: Date.now() / 1000 });
      const result = await execAgent(exec.prompt);
      // Agent.run() returns a single result string — persist it as one token.
      appendToken(executionId, result.result);
      transitionState(executionId, "completed", { output: result.result });
      appendEvent(executionId, "state_change", { state: "completed", ts: Date.now() / 1000 });
    } else {
      // Streaming chat — Agent.chatStream() yields tokens
      appendEvent(executionId, "thinking", { value: "streaming from backend…", ts: Date.now() / 1000 });

      for await (const token of streamAgentChat(exec.prompt)) {
        // Check for cancellation between tokens
        if (isCancellationRequested(executionId)) {
          appendEvent(executionId, "state_change", { state: "cancelled", ts: Date.now() / 1000 });
          transitionState(executionId, "cancelled", {
            recovery_note: "Cancellation requested by user",
          });
          return;
        }
        // Persist each token atomically (output + event journal)
        appendToken(executionId, token);
      }

      // Mark as completed — the final output is already persisted.
      transitionState(executionId, "completed");
      appendEvent(executionId, "state_change", { state: "completed", ts: Date.now() / 1000 });
    }
  } catch (err) {
    const e = err as Error;
    const msg = e.message ?? String(e);
    // Persist partial output + error
    const current = getExecution(executionId);
    transitionState(executionId, "failed", {
      output: current?.output ?? "",
      error: msg,
      recovery_note: `Execution failed: ${msg}`,
    });
    appendEvent(executionId, "error", { error: msg, ts: Date.now() / 1000 });
    appendEvent(executionId, "state_change", { state: "failed", ts: Date.now() / 1000 });
  }
}
