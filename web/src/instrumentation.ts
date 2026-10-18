/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Initializes the v2 workflow scheduler. Uses setInterval + a tiny
 * built-in cron parser — no external dependencies (node-cron removed
 * because Turbopack couldn't bundle it).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { initTemplates } = await import("@/lib/axoniz/v2-templates");
      initTemplates();
      const { refreshSchedule } = await import("@/lib/axoniz/v2-scheduler-server");
      refreshSchedule();
      const { refreshFileWatchers } = await import("@/lib/axoniz/v2-scheduler-server");
      refreshFileWatchers();
      console.log("[instrumentation] v2 scheduler started");
    } catch (e) {
      console.warn("[instrumentation] scheduler init failed:", e instanceof Error ? e.message : String(e));
    }
  }
}
