/**
 * Next.js instrumentation hook — runs once on server startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { initTemplates } = await import("@/lib/axoniz/v2-templates");
      initTemplates();
      const { refreshSchedule } = await import("@/lib/axoniz/v2-scheduler-server");
      await refreshSchedule();
      setInterval(() => refreshSchedule().catch(() => {}), 60_000);
      console.log("[instrumentation] v2 scheduler started");
    } catch (e) {
      console.warn("[instrumentation] scheduler init failed:", e instanceof Error ? e.message : String(e));
    }
  }
}
