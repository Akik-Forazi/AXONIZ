/**
 * FRAZIYM three-tier directory policy.
 *
 *   T1 HOME     ~/.fraziym              — user config + data (roams with the user)
 *   T2 LOCAL    %LOCALAPPDATA%\FRAZIYM  — machine-local caches/state (never roams)
 *   T3 PROGRAMS %ProgramFiles%\fraziym  — installed binaries (needs elevation)
 *
 * Overrides: FRAZIYM_HOME, FRAZIYM_LOCAL, FRAZIYM_PROGRAMS.
 *
 * Cross-platform defaults:
 *   T2: win  %LOCALAPPDATA%\FRAZIYM
 *       mac  ~/Library/Caches/FRAZIYM
 *       linux $XDG_CACHE_HOME/fraziym (or ~/.cache/fraziym)
 *   T3: win  %ProgramFiles%\fraziym
 *       mac  /usr/local/fraziym
 *       linux /opt/fraziym
 */
import os from "node:os";
import path from "node:path";

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
