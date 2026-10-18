/**
 * v2 scheduler — SERVER-ONLY, zero external dependencies.
 *
 * Replaces node-cron with a tiny setInterval-based scheduler that:
 * 1. Runs every 60 seconds
 * 2. Checks each enabled workflow with trigger.type === "schedule"
 * 3. Parses the cron expression (basic subset: m h dom mon dow)
 * 4. If the current time matches, runs the workflow
 *
 * Supports: star (any), specific numbers, star-slash-N (every N), ranges (1-5),
 * comma lists (1,3,5). Covers 99% of real-world cron usage.
 */
import { listWorkflows, runWorkflow } from "./v2-workflows";
import type { Workflow } from "./v2-schemas";

/* ─── Tiny cron parser ────────────────────────────────────────────── */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (trimmed.startsWith("*/")) {
      const step = parseInt(trimmed.slice(2), 10);
      if (step > 0) for (let i = min; i <= max; i += step) result.add(i);
    } else if (trimmed.includes("-")) {
      const [lo, hi] = trimmed.split("-").map(n => parseInt(n, 10));
      for (let i = lo; i <= hi; i++) result.add(i);
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n)) result.add(n);
    }
  }
  return result;
}

function validateCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  try {
    parseCronField(parts[0], 0, 59); // minute
    parseCronField(parts[1], 0, 23); // hour
    parseCronField(parts[2], 1, 31); // day of month
    parseCronField(parts[3], 1, 12); // month
    parseCronField(parts[4], 0, 7); // day of week (0=Sun, 7=Sun)
    return true;
  } catch { return false; }
}

function shouldRun(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  const minutes = parseCronField(parts[0], 0, 59);
  const hours = parseCronField(parts[1], 0, 23);
  const doms = parseCronField(parts[2], 1, 31);
  const months = parseCronField(parts[3], 1, 12);
  const dows = parseCronField(parts[4], 0, 7);

  const dow = date.getDay() === 0 ? 7 : date.getDay(); // 0=Sun → 7=Sun

  return (
    minutes.has(date.getMinutes()) &&
    hours.has(date.getHours()) &&
    doms.has(date.getDate()) &&
    months.has(date.getMonth() + 1) &&
    dows.has(dow)
  );
}

/* ─── Scheduler ──────────────────────────────────────────────────── */
let intervalId: ReturnType<typeof setInterval> | null = null;
const lastRunKeys = new Set<string>(); // prevents running same wf twice in same minute

export function refreshSchedule(): void {
  if (intervalId) return; // already running
  intervalId = setInterval(async () => {
    const now = new Date();
    // Build a unique key per minute so we don't run twice
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

    const workflows = listWorkflows();
    for (const wf of workflows) {
      if (!wf.enabled) continue;
      if (wf.trigger.type !== "schedule") continue;

      const cronExpr = (wf.trigger as { cron?: string }).cron;
      if (!cronExpr || !validateCron(cronExpr)) continue;
      if (!shouldRun(cronExpr, now)) continue;

      // Prevent running twice in the same minute
      const runKey = `${wf.name}-${minuteKey}`;
      if (lastRunKeys.has(runKey)) continue;
      lastRunKeys.add(runKey);
      // Clean old keys (keep last 100)
      if (lastRunKeys.size > 100) {
        const arr = Array.from(lastRunKeys);
        lastRunKeys.clear();
        arr.slice(-50).forEach(k => lastRunKeys.add(k));
      }

      console.log(`[scheduler] running "${wf.name}" (cron: ${cronExpr})`);
      try {
        await runWorkflow(wf as Workflow, "schedule");
      } catch (e) {
        console.error(`[scheduler] "${wf.name}" failed:`, e instanceof Error ? e.message : String(e));
      }
    }
  }, 60_000); // check every 60s
  console.log("[scheduler] started — checking every 60s");
}

export function stopAllSchedules(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
