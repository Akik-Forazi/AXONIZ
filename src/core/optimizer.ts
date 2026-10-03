/**
 * AXONIZ BackendOptimizer — Hardware-aware performance tuning.
 * Benchmarks the local device and optimizes LLM backend settings.
 *
 * Port of axoniz/core/optimizer.py
 *
 * Port notes:
 *  - `psutil.virtual_memory().total` → `os.totalmem()`.
 *  - `multiprocessing.cpu_count()` → `os.cpus().length`.
 *  - `platform.system()` → the Python-style platform name derived from
 *    `process.platform` ("Windows" / "Linux" / "Darwin").
 *  - `subprocess.run([...])` → `execFileSync` (the profile API stays synchronous,
 *    matching the Python contract used by `intelligence/reflex.py`).
 *  - `which nvidia-smi` → `whichSync` from ./which.ts.
 */
import os from "node:os";
import { execFileSync } from "node:child_process";
import { whichSync } from "./which.js";

export interface HardwareProfile {
  os: string;
  cpu_count: number;
  total_ram_gb: number;
  has_gpu: boolean;
  gpu_info: string;
}

/** Python-style platform name (`platform.system()`). */
function pythonPlatform(): string {
  switch (process.platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "Darwin";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}

export function get_hardware_profile(): HardwareProfile {
  const profile: HardwareProfile = {
    os: pythonPlatform(),
    cpu_count: os.cpus().length,
    total_ram_gb: 0,
    has_gpu: false,
    gpu_info: "",
  };

  // RAM
  try {
    profile.total_ram_gb = Math.round((os.totalmem() / 1024 ** 3) * 100) / 100;
  } catch {
    /* leave 0, mirroring the ImportError branch */
  }

  // GPU (basic NVIDIA check)
  try {
    if (profile.os === "Windows") {
      try {
        const stdout = execFileSync(
          "nvidia-smi",
          ["--query-gpu=name,memory.total", "--format=csv,noheader"],
          { encoding: "utf-8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] },
        );
        profile.has_gpu = true;
        profile.gpu_info = stdout.trim();
      } catch {
        /* no nvidia-smi / non-zero exit → no GPU */
      }
    } else {
      // Linux/Mac check
      if (whichSync("nvidia-smi")) {
        profile.has_gpu = true;
      }
    }
  } catch {
    /* best effort */
  }

  return profile;
}

/** camelCase alias. */
export const getHardwareProfile = get_hardware_profile;

/**
 * Returns an optimized version of the config based on hardware.
 * `setdefault` semantics are preserved: context size / GPU layers only fill in
 * missing keys, while thread count and flash attention are always overwritten.
 */
export function optimize_config(currentCfg: Record<string, unknown>): Record<string, unknown> {
  const hw = get_hardware_profile();
  const newCfg: Record<string, unknown> = { ...currentCfg };

  // CPU threads: typically N-1, or N-2 on wider machines
  let threads = Math.max(1, hw.cpu_count - 1);
  if (hw.cpu_count > 8) {
    threads = hw.cpu_count - 2;
  }
  newCfg["n_threads"] = threads;

  // Context size: match RAM
  if (hw.total_ram_gb > 32) {
    if (!("n_ctx" in newCfg)) newCfg["n_ctx"] = 16384;
  } else if (hw.total_ram_gb > 16) {
    if (!("n_ctx" in newCfg)) newCfg["n_ctx"] = 8192;
  } else if (!("n_ctx" in newCfg)) {
    newCfg["n_ctx"] = 4096;
  }

  // GPU layers for llama.cpp
  if (hw.has_gpu) {
    if (!("n_gpu_layers" in newCfg)) newCfg["n_gpu_layers"] = 35;
  } else {
    newCfg["n_gpu_layers"] = 0;
  }

  // Flash attention (if supported by the backend)
  newCfg["flash_attn"] = true;

  return newCfg;
}

/** camelCase alias. */
export const optimizeConfig = optimize_config;

/** Minimal shape of the agent this module mutates (parent owns src/core/agent.ts). */
export interface OptimizableAgent {
  config: Record<string, unknown>;
  _rebuild_llm?: () => unknown;
}

/**
 * Applies optimizations directly to a running agent's backend.
 * Returns the optimized config that was merged in.
 *
 * Note: `_rebuild_llm()` is awaited when it returns a promise (the TypeScript
 * backend rebuild is async), hence this function is async.
 */
export async function apply_optimizations(agent: OptimizableAgent): Promise<Record<string, unknown>> {
  const current = agent.config;
  const optimized = optimize_config(current);
  Object.assign(agent.config, optimized);
  if (typeof agent._rebuild_llm === "function") {
    await agent._rebuild_llm();
  }
  return optimized;
}

/** camelCase alias. */
export const applyOptimizations = apply_optimizations;
