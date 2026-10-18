/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * This is where we initialize the v2 workflow scheduler (node-cron).
 * It runs in the Node.js runtime (NOT the browser), so node-cron
 * works here. The SchedulerProvider was a "use client" component
 * that tried to import node-cron in the browser → crashed every page.
 *
 * This file is automatically called by Next.js on startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      // Initialize templates (writes 5 starter templates to ~/.axoniz/templates/)
      const { initTemplates } = await import("@/lib/axoniz/v2-templates");
      initTemplates();
      // Start the workflow scheduler (node-cron, server-only)
      const { refreshSchedule } = await import("@/lib/axoniz/v2-scheduler-server");
      refreshSchedule();
      // Re-scan every 60s for new workflows created via the UI
      setInterval(refreshSchedule, 60_000);
      console.log("[instrumentation] v2 scheduler started");
    } catch (e) {
      console.warn("[instrumentation] scheduler init failed:", e instanceof Error ? e.message : String(e));
    }
  }
}
