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
  appendToken, appendTokenBatch,
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

      // ── BATCHED TOKEN WRITES ──────────────────────────────────────
      // Instead of writing each token to SQLite individually (which
      // causes 200 fsyncs/second at 200 t/s — disk I/O bottleneck
      // that slows streaming from 200 t/s to 2 t/s), we buffer tokens
      // and flush them as a SINGLE SQLite transaction every 50ms or
      // every 20 tokens (whichever comes first).
      // This reduces SQLite writes by 10-50x.
      const tokenBuffer: string[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      function flushTokenBuffer() {
        if (tokenBuffer.length === 0) return;
        const batch = tokenBuffer.splice(0);
        try { appendTokenBatch(executionId, batch); } catch (e) {
          // Fallback to individual writes if batch fails
          for (const t of batch) { try { appendToken(executionId, t); } catch {} }
        }
        flushTimer = null;
      }

      for await (const token of streamAgentChat(exec.prompt)) {
        if (isCancellationRequested(executionId)) {
          flushTokenBuffer(); // flush remaining tokens before cancelling
          appendEvent(executionId, "state_change", { state: "cancelled", ts: Date.now() / 1000 });
          transitionState(executionId, "cancelled", { recovery_note: "Cancellation requested by user" });
          releaseClaim(executionId);
          return;
        }
        tokenBuffer.push(token);
        if (tokenBuffer.length >= 20) {
          // Batch is full — flush immediately
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          flushTokenBuffer();
        } else if (!flushTimer) {
          // Start a 50ms timer to flush small batches
          flushTimer = setTimeout(flushTokenBuffer, 50);
        }
      }
      // Final flush — write any remaining buffered tokens
      if (flushTimer) { clearTimeout(flushTimer); }
      flushTokenBuffer();

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
