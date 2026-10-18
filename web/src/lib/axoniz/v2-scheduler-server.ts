/**
 * v2 scheduler — SERVER-ONLY module (no "use client").
 *
 * Uses node-cron to schedule workflows. Must be imported only from
 * server context (instrumentation.ts, API routes) — NOT from React
 * components.
 */
import cron from "node-cron";
import { listWorkflows, runWorkflow } from "./v2-workflows";

const scheduledJobs: cron.ScheduledTask[] = [];

export function refreshSchedule() {
  // Stop all existing jobs
  for (const job of scheduledJobs) {
    try { job.stop(); } catch { /* ignore */ }
  }
  scheduledJobs.length = 0;

  const workflows = listWorkflows();
  for (const wf of workflows) {
    if (!wf.enabled) continue;
    if (wf.trigger.type !== "schedule") continue;

    const cronExpr = (wf.trigger as { cron?: string }).cron;
    if (!cronExpr || !cron.validate(cronExpr)) continue;

    const task = cron.schedule(cronExpr, async () => {
      console.log(`[scheduler] running "${wf.name}" (cron: ${cronExpr})`);
      try { await runWorkflow(wf, "schedule"); }
      catch (e) { console.error(`[scheduler] "${wf.name}" failed:`, e); }
    }, { scheduled: true });

    scheduledJobs.push(task);
  }
  console.log(`[scheduler] ${scheduledJobs.length} scheduled workflow(s) active`);
}

export function stopAllSchedules() {
  for (const job of scheduledJobs) { try { job.stop(); } catch {} }
  scheduledJobs.length = 0;
}
