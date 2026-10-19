/**
 * FRAZIYM three-tier directory policy (web mirror of src/core/paths.ts).
 *
 *   T1 HOME     ~/.fraziym              — user config + data (roams with the user)
 *   T2 LOCAL    %LOCALAPPDATA%\FRAZIYM  — machine-local caches/state (never roams)
 *   T3 PROGRAMS %ProgramFiles%\fraziym  — installed binaries (needs elevation)
 *
 * Overrides: FRAZIYM_HOME, FRAZIYM_LOCAL, FRAZIYM_PROGRAMS.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function nonEmpty(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** T1 — user config + data root (`~/.fraziym`). */
export function fraziymHome(): string {
  return nonEmpty(process.env.FRAZIYM_HOME) ?? path.join(os.homedir(), ".fraziym");
}

/** T2 — machine-local cache/state root. */
export function fraziymLocal(): string {
  const override = nonEmpty(process.env.FRAZIYM_LOCAL);
  if (override) return override;
  if (process.platform === "win32") {
    const base = nonEmpty(process.env.LOCALAPPDATA) ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "FRAZIYM");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "FRAZIYM");
  }
  const xdg = nonEmpty(process.env.XDG_CACHE_HOME);
  return path.join(xdg ?? path.join(os.homedir(), ".cache"), "fraziym");
}

/** T3 — installed binaries root (needs elevation to write). */
export function fraziymPrograms(): string {
  const override = nonEmpty(process.env.FRAZIYM_PROGRAMS);
  if (override) return override;
  if (process.platform === "win32") {
    const base =
      nonEmpty(process.env.ProgramFiles) ?? nonEmpty(process.env.PROGRAMFILES) ?? "C:\\Program Files";
    return path.join(base, "fraziym");
  }
  if (process.platform === "darwin") return "/usr/local/fraziym";
  return "/opt/fraziym";
}

/** T1 — axoniz user config + data root (`~/.fraziym/axoniz`). */
export function axonizHome(): string {
  return path.join(fraziymHome(), "axoniz");
}

/** T2 — axoniz machine-local cache/state root. */
export function axonizLocal(): string {
  return path.join(fraziymLocal(), "axoniz");
}

/** llama-server bin dir: T3 when installed there, else T2 fallback. */
export function llamaBinDir(): string {
  const t3 = path.join(fraziymPrograms(), "axoniz", "llama");
  return fs.existsSync(t3) ? t3 : path.join(axonizLocal(), "llama");
}
