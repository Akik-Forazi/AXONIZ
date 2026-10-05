/**
 * Health check system for production monitoring.
 * Port of axoniz/core/health.py (psutil -> systeminformation).
 */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import * as si from "systeminformation";
import { AXONIZ_HOME } from "./config.js";

export interface CheckResult {
  status: "ok" | "warning" | "error";
  [key: string]: unknown;
}

export interface HealthReport {
  status: "healthy" | "degraded";
  timestamp: number;
  uptime_seconds: number;
  checks: {
    memory: CheckResult;
    disk: CheckResult;
    backend: CheckResult;
    database: CheckResult;
  };
}

export class HealthCheck {
  readonly startTime = Date.now();
  /** Optional override so health checks can report on the live agent backend. */
  backendProbe: (() => Promise<Record<string, unknown>>) | null = null;

  async checkAll(): Promise<HealthReport> {
    const [memory, disk, backend, database] = await Promise.all([
      this.checkMemory(),
      this.checkDisk(),
      this.checkBackend(),
      this.checkDatabase(),
    ]);
    const checks = { memory, disk, backend, database };
    const degraded = Object.values(checks).some((c) => c.status === "error");
    return {
      status: degraded ? "degraded" : "healthy",
      timestamp: Date.now() / 1000,
      uptime_seconds: (Date.now() - this.startTime) / 1000,
      checks,
    };
  }

  async checkMemory(): Promise<CheckResult> {
    try {
      const mem = await si.mem();
      const usedPercent = (mem.active / mem.total) * 100;
      return {
        status: usedPercent < 90 ? "ok" : "warning",
        used_percent: Math.round(usedPercent * 10) / 10,
        available_mb: Math.round(mem.available / 1024 / 1024),
      };
    } catch (e) {
      return { status: "error", error: errMsg(e) };
    }
  }

  async checkDisk(): Promise<CheckResult> {
    try {
      const drive = path.parse(AXONIZ_HOME).root || os.homedir();
      const fsSize = await si.fsSize();
      const match =
        fsSize.find((d) => d.mount && path.parse(d.mount).root === drive) ?? fsSize[0];
      if (!match) return { status: "warning", message: "No filesystem information" };
      return {
        status: match.use < 90 ? "ok" : "warning",
        used_percent: Math.round(match.use * 10) / 10,
        available_gb: Math.round((match.available / 1024 / 1024 / 1024) * 10) / 10,
      };
    } catch (e) {
      return { status: "error", error: errMsg(e) };
    }
  }

  async checkBackend(): Promise<CheckResult> {
    try {
      if (this.backendProbe) {
        return { status: "ok", details: await this.backendProbe() };
      }
      // Lazy import to avoid a cycle (backend -> config -> health).
      const [{ getBackend }, { loadConfig }] = await Promise.all([
        import("./backend/index.js"),
        import("./config.js"),
      ]);
      const backend = getBackend(loadConfig());
      return { status: "ok", details: await backend.healthCheck() };
    } catch (e) {
      return { status: "error", error: errMsg(e) };
    }
  }

  checkDatabase(): CheckResult {
    try {
      const dbPath = path.join(AXONIZ_HOME, "trajectory.db");
      if (!fs.existsSync(dbPath)) {
        return { status: "warning", message: "Database not initialized" };
      }
      fs.accessSync(dbPath, fs.constants.W_OK);
      return { status: "ok" };
    } catch (e) {
      return { status: "error", error: errMsg(e) };
    }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const healthCheck = new HealthCheck();
