/**
 * Execution Runner — picks up a queued execution and runs it to
 * completion using the CLI's Agent. Runs independently of any
 * HTTP request — the browser can disconnect and the execution
 * continues.
 *
 * Uses transactional claiming (claimExecution) to prevent two
 * workers from running the same execution concurrently.
 */

import { randomBytes } from "node:crypto";
import {
  getExecution,
  transitionState,
  appendToken,
  appendEvent,
  isCancellationRequested,
  claimExecution,
  releaseClaim,
} from "@/lib/axoniz/execution-manager";
import { streamAgentChat, execAgent, loadCliConfig } from "@/lib/axoniz/cli-bridge";

const WORKER_ID = randomBytes(4).toString("hex");

export async function runExecution(executionId: string): Promise<void> {
  const exec = getExecution(executionId);
  if (!exec) throw new Error(`execution ${executionId} not found`);

  // Transactional claim — prevents concurrent workers.
  // If another worker already claimed this, return without running.
  const claimed = claimExecution(executionId, WORKER_ID);
  if (!claimed) {
    // Another worker is already running this execution.
    return;
  }

  appendEvent(executionId, "state_change", { state: "running", ts: Date.now() / 1000 });

  try {
    if (exec.mode === "agent") {
      appendEvent(executionId, "thinking", { value: "running agent loop…", ts: Date.now() / 1000 });
      const result = await execAgent(exec.prompt);
      appendToken(executionId, result.result);
      transitionState(executionId, "completed", { output: result.result });
      appendEvent(executionId, "state_change", { state: "completed", ts: Date.now() / 1000 });
    } else {
      appendEvent(executionId, "thinking", { value: "streaming from backend…", ts: Date.now() / 1000 });

      for await (const token of streamAgentChat(exec.prompt)) {
        if (isCancellationRequested(executionId)) {
          appendEvent(executionId, "state_change", { state: "cancelled", ts: Date.now() / 1000 });
          transitionState(executionId, "cancelled", { recovery_note: "Cancellation requested by user" });
          releaseClaim(executionId);
          return;
        }
        appendToken(executionId, token);
      }

      transitionState(executionId, "completed");
      appendEvent(executionId, "state_change", { state: "completed", ts: Date.now() / 1000 });
    }
  } catch (err) {
    const e = err as Error;
    const msg = e.message ?? String(e);
    const current = getExecution(executionId);
    transitionState(executionId, "failed", {
      output: current?.output ?? "",
      error: msg,
      recovery_note: `Execution failed: ${msg}`,
    });
    appendEvent(executionId, "error", { error: msg, ts: Date.now() / 1000 });
    appendEvent(executionId, "state_change", { state: "failed", ts: Date.now() / 1000 });
  } finally {
    releaseClaim(executionId);
  }
}
