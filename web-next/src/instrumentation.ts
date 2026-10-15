/**
 * Next.js instrumentation — runs ONCE on server startup.
 *
 * This is the official Next.js way to run code when the server starts.
 * We use it to call execution-manager.recoverOnStartup() which:
 *   1. Finds all non-terminal executions (queued, running, cancel_requested)
 *   2. Marks them as "interrupted" with a recovery note
 *   3. The user can then retry them explicitly (no automatic rerun)
 *
 * This is idempotent — calling it multiple times is safe because
 * terminal executions are not affected.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  // Only run on the server (Node.js runtime), not in the browser or Edge.
  // node:sqlite is only available in Node.js, not Edge.
  if (typeof window !== "undefined") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { recoverOnStartup } = await import("@/lib/axoniz/execution-manager");
    const result = recoverOnStartup();
    if (result.interrupted > 0) {
      console.log(`[axoniz] startup recovery: ${result.interrupted} interrupted executions found`);
      for (const exec of result.recovered) {
        console.log(`[axoniz]   ${exec.id} (${exec.mode}): ${exec.prompt.slice(0, 60)} → interrupted`);
      }
    }
  } catch (e) {
    // Don't crash the server if recovery fails — log and continue.
    console.error("[axoniz] startup recovery failed:", e instanceof Error ? e.message : String(e));
  }
}
