/**
 * src/integrations/installer.ts
 * =============================
 * Automated installation for AXONIZ integrations.
 *
 * v0.3.4+ behavior — axodex is now its own npm package (@fraziym/axodex),
 * published at https://www.npmjs.com/package/@fraziym/axodex. The
 * installer just runs `npm install -g @fraziym/axodex` — no git clone,
 * no AXONIZ repo download (which used to pull 30+ MiB and never linked
 * the binary on PATH).
 *
 * Custom integrations can still be installed from any git URL via
 * `axoniz install <git-url>` — the generic git-clone path is preserved
 * for that case.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { getLogger } from "../core/logger.js";
import { AXONIZ_HOME } from "../core/config.js";
import { C } from "../core/cli.js"; // console colors

const logger = getLogger();

export const INTEGRATIONS_DIR = path.join(AXONIZ_HOME, "integrations");

interface NpmIntegrationManifest {
  name: string;
  packageName: string;
  binaryName: string;
  description: string;
}

/** Registry of officially supported Axoniz integrations (npm packages). */
const REGISTRY: Record<string, NpmIntegrationManifest> = {
  axodex: {
    name: "Axodex",
    packageName: "@fraziym/axodex",
    binaryName: "axodex",
    description: "Axodex Graph Intelligence Engine",
  },
};

/**
 * Install an integration. Two paths:
 *
 *   1. Registered name (e.g. 'axodex') → run `npm install -g <packageName>`
 *      and verify the binary lands on PATH. One-line, ~5s, no git clone.
 *
 *   2. Raw git URL → fall back to the legacy clone-into-~/.axoniz/integrations/
 *      flow (for custom integrations that aren't on npm yet).
 */
export function installIntegration(target: string): void {
  console.log(
    `\n${C.BL}[Axoniz Installer]${C.R} Preparing to install integration: ${C.CY}${target}${C.R}`,
  );

  if (!fs.existsSync(INTEGRATIONS_DIR)) {
    fs.mkdirSync(INTEGRATIONS_DIR, { recursive: true });
    logger.info(`Created integrations directory at ${INTEGRATIONS_DIR}`);
  }

  // Path 1: registered npm integration
  if (REGISTRY[target.toLowerCase()]) {
    installViaNpm(REGISTRY[target.toLowerCase()]!);
    return;
  }

  // Path 2: raw git URL (custom integrations)
  if (target.startsWith("http") || target.startsWith("git")) {
    installViaGitClone(target);
    return;
  }

  console.error(
    `  ${C.RD}[-] Unknown integration '${target}'. Provide a registered name (e.g. 'axodex') or a full git URL.${C.R}`,
  );
  process.exitCode = 1;
}

/* ── npm install path ─────────────────────────────────────────────────── */

function installViaNpm(manifest: NpmIntegrationManifest): void {
  const pkg = manifest.packageName;
  console.log(`  ${C.DG}Installing ${pkg} globally via npm...${C.R}`);

  // Detect package manager preference: bun (fastest) → pnpm → npm
  const pm = detectPackageManager();
  console.log(`  ${C.DG}Using ${pm} (set AXONIZ_PM to override)${C.R}`);

  try {
    execSync(`${pm} ${pm === "bun" ? "add" : "install"} -g ${pkg}`, {
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch (e) {
    console.error(
      `  ${C.RD}[-] npm install failed: ${String(e)}${C.R}\n` +
        `    Try manually:  npm install -g ${pkg}`,
    );
    process.exitCode = 1;
    return;
  }

  // Verify the binary is now on PATH
  const bin = manifest.binaryName;
  const onPath = whichSync(bin);
  if (onPath) {
    console.log(
      `\n  ${C.OK}[+] Successfully installed ${manifest.name} via npm.${C.R}`,
    );
    console.log(`  ${C.DG}Binary: ${bin}${C.R}`);
    console.log(`  ${C.DG}Path:   ${onPath}${C.R}\n`);
    console.log(
      `  ${C.DG}Verify:  ${bin} --help${C.R}\n`,
    );
  } else {
    console.log(
      `\n  ${C.OK}[+] Installed ${manifest.name}.${C.R}`,
    );
    console.log(
      `  ${C.YL}[!] Binary '${bin}' not found on PATH — you may need to open a new shell.${C.R}`,
    );
    console.log(`  ${C.DG}Try:  ${bin} --help${C.R}\n`);
  }
}

/** Detect the user's preferred package manager (override via AXONIZ_PM env var). */
function detectPackageManager(): "bun" | "pnpm" | "npm" {
  const override = process.env.AXONIZ_PM;
  if (override === "bun" || override === "pnpm" || override === "npm") {
    return override;
  }
  // Prefer bun (fastest), then pnpm, then npm
  if (whichSync("bun")) return "bun";
  if (whichSync("pnpm")) return "pnpm";
  return "npm";
}

/** Cross-platform `which`. */
function whichSync(cmd: string): string | null {
  if (!cmd) return null;
  if (cmd.includes(path.sep) || cmd.includes("/")) {
    try {
      return fs.existsSync(cmd) ? cmd : null;
    } catch {
      return null;
    }
  }
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/* ── legacy git-clone path (custom integrations only) ─────────────────── */

function installViaGitClone(repoUrl: string): void {
  const dirName =
    repoUrl.split("/").pop()?.replace(".git", "") || "unknown_integration";

  const installPath = path.join(INTEGRATIONS_DIR, dirName);

  if (fs.existsSync(installPath)) {
    console.log(`  ${C.YL}[!] Integration already exists at ${installPath}${C.R}`);
    console.log(`  ${C.DG}Pulling latest changes...${C.R}`);
    try {
      execSync("git pull", { cwd: installPath, stdio: "inherit" });
      console.log(`  ${C.OK}[+] Successfully updated ${dirName}.${C.R}\n`);
    } catch (e) {
      console.error(`  ${C.RD}[-] Failed to update ${dirName}: ${String(e)}${C.R}`);
      process.exitCode = 1;
    }
    return;
  }

  console.log(`  ${C.DG}Cloning into ${installPath}...${C.R}`);
  try {
    execSync(`git clone ${repoUrl} "${installPath}"`, { stdio: "inherit" });

    if (fs.existsSync(path.join(installPath, "package.json"))) {
      console.log(`  ${C.DG}Found package.json, running npm install...${C.R}`);
      execSync("npm install", { cwd: installPath, stdio: "inherit" });
    }

    if (fs.existsSync(path.join(installPath, "tsconfig.json"))) {
      console.log(`  ${C.DG}Found tsconfig.json, running npm run build...${C.R}`);
      try {
        execSync("npm run build", { cwd: installPath, stdio: "inherit" });
      } catch {
        console.log(`  ${C.DG}No default build script found, skipping compilation.${C.R}`);
      }
    }

    console.log(
      `\n  ${C.OK}[+] Successfully installed ${dirName} to ~/.axoniz/integrations/${dirName}${C.R}\n`,
    );
  } catch (e) {
    console.error(`  ${C.RD}[-] Installation failed: ${String(e)}${C.R}`);
    process.exitCode = 1;
  }
}
