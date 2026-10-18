/**
 * AXONIZ v2 — workflow scheduler.
 *
 * Reads all workflows from ~/.axoniz/workflows/, finds those with
 * trigger.type === "schedule", and registers cron jobs via node-cron.
 * On each cron tick, runs the workflow.
 *
 * Started by the SchedulerProvider component (mounted in the auth layout).
 * In dev mode (next dev), the server runs continuously so the scheduler
 * persists. In production with the CLI's `axoniz --web`, the scheduler
 * runs as part of the Next.js server process.
 *
 * Renders null — no visual output, just side-effects.
 */
import { useEffect, useRef } from "react";
import cron from "node-cron";
import { listWorkflows, runWorkflow } from "@/lib/axoniz/v2-workflows";
import { initTemplates } from "@/lib/axoniz/v2-templates";
import type { Workflow } from "@/lib/axoniz/v2-schemas";

const scheduledJobs: cron.ScheduledTask[] = [];

/** Re-scan workflows and (re)register all schedule triggers. */
export function refreshSchedule() {
  // Stop all existing jobs
  for (const job of scheduledJobs) {
    try { job.stop(); } catch { /* ignore */ }
  }
  scheduledJobs.length = 0;

  // Find all workflows with schedule triggers
  const workflows = listWorkflows();
  for (const wf of workflows) {
    if (!wf.enabled) continue;
    if (wf.trigger.type !== "schedule") continue;

    const cronExpr = (wf.trigger as { cron?: string }).cron;
    if (!cronExpr || !cron.validate(cronExpr)) {
      console.warn(`[scheduler] invalid cron expression for "${wf.name}": ${cronExpr}`);
      continue;
    }

    const task = cron.schedule(cronExpr, async () => {
      console.log(`[scheduler] running workflow "${wf.name}" (cron: ${cronExpr})`);
      try {
        await runWorkflow(wf, "schedule");
      } catch (e) {
        console.error(`[scheduler] workflow "${wf.name}" failed:`, e instanceof Error ? e.message : String(e));
      }
    }, { scheduled: true });

    scheduledJobs.push(task);
    console.log(`[scheduler] registered "${wf.name}" with cron: ${cronExpr}`);
  }

  console.log(`[scheduler] ${scheduledJobs.length} scheduled workflow(s) active`);
}

/** Stop all scheduled jobs (called on unmount). */
export function stopAllSchedules() {
  for (const job of scheduledJobs) {
    try { job.stop(); } catch { /* ignore */ }
  }
  scheduledJobs.length = 0;
}

/** React provider — mounts once in the auth layout. */
export function SchedulerProvider() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Start the scheduler
    initTemplates();
    refreshSchedule();

    // Re-scan every 60s (picks up new workflows created via the UI)
    const interval = setInterval(refreshSchedule, 60_000);

    return () => {
      clearInterval(interval);
      stopAllSchedules();
    };
  }, []);

  return null;
}
