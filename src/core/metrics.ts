/**
 * Prometheus metrics (free, local monitoring). No cloud costs.
 * Port of axoniz/core/metrics.py (prometheus_client -> prom-client).
 */
import os from "node:os";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import * as si from "systeminformation";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const requestsTotal = new Counter({
  name: "axoniz_requests_total",
  help: "Total requests processed",
  labelNames: ["endpoint", "status"],
  registers: [registry],
});

export const requestDuration = new Histogram({
  name: "axoniz_request_duration_seconds",
  help: "Request processing time",
  labelNames: ["endpoint"],
  registers: [registry],
});

export const activeAgents = new Gauge({
  name: "axoniz_active_agents",
  help: "Number of active agent instances",
  registers: [registry],
});

export const toolExecutions = new Counter({
  name: "axoniz_tool_executions_total",
  help: "Total tool executions",
  labelNames: ["tool_name", "status"],
  registers: [registry],
});

export const memoryUsageMb = new Gauge({
  name: "axoniz_memory_usage_mb",
  help: "Current memory usage in MB",
  registers: [registry],
});

export const cpuUsagePercent = new Gauge({
  name: "axoniz_cpu_usage_percent",
  help: "Current CPU usage percent",
  registers: [registry],
});

/** Track request metrics. */
export function trackRequest(endpoint: string, status: string, duration: number): void {
  requestsTotal.labels(endpoint, status).inc();
  requestDuration.labels(endpoint).observe(duration);
}

/** Track tool execution. */
export function trackToolExecution(toolName: string, success: boolean): void {
  toolExecutions.labels(toolName, success ? "success" : "error").inc();
}

/** Update the process memory usage gauge. */
export function updateMemoryUsage(): void {
  const mem = process.memoryUsage();
  memoryUsageMb.set(mem.rss / 1024 / 1024);
}

/** Get Prometheus metrics in text format. */
export async function getMetrics(): Promise<string> {
  updateMemoryUsage();
  return registry.metrics();
}

export interface Telemetry {
  cpu: number;
  ram: number;
  disk: number;
  net_mb: number;
}

let lastCpuSample: { idle: number; total: number } | null = null;

/**
 * Collect real-time system performance telemetry.
 * CPU% is computed from the delta between successive calls (like psutil's
 * non-blocking interval=None behaviour).
 */
export async function getSystemTelemetry(): Promise<Telemetry> {
  try {
    const [load, mem, fsSize, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
    ]);

    let cpu = Math.round(load.currentLoad * 10) / 10;
    const cpus = os.cpus();
    if (cpus.length > 0) {
      const total = cpus.map(
        (c) => c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
      );
      const idle = cpus.map((c) => c.times.idle);
      const totalSum = total.reduce((a, b) => a + b, 0);
      const idleSum = idle.reduce((a, b) => a + b, 0);
      if (lastCpuSample) {
        const totalDelta = totalSum - lastCpuSample.total;
        const idleDelta = idleSum - lastCpuSample.idle;
        if (totalDelta > 0) {
          cpu = Math.round(((totalDelta - idleDelta) / totalDelta) * 1000) / 10;
        }
      }
      lastCpuSample = { idle: idleSum, total: totalSum };
    }

    const disk = fsSize.length > 0 ? Math.round(fsSize[0].use * 10) / 10 : 0;
    const netBytes = net.reduce((acc, n) => acc + (n.rx_bytes ?? 0) + (n.tx_bytes ?? 0), 0);

    return {
      cpu,
      ram: Math.round((mem.active / mem.total) * 1000) / 10,
      disk,
      net_mb: Math.round((netBytes / (1024 * 1024)) * 10) / 10,
    };
  } catch {
    return { cpu: 0, ram: 0, disk: 0, net_mb: 0 };
  }
}

function osCpus() {
  return os.cpus();
}
void osCpus;
