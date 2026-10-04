/**
 * src/integrations/installer.ts
 * =============================
 * Automated installation and management for Axoniz Integrations.
 * Installs integrations directly into `~/.axoniz/integrations/`.
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

interface IntegrationManifest {
  name: string;
  repo: string;
  description: string;
  postinstall?: string;
  check?: string;
}

/** Registry of officially supported Axoniz integrations */
const REGISTRY: Record<string, IntegrationManifest> = {
  axodex: {
    name: "Axodex",
    repo: "https://github.com/Akik-Forazi/AXONIZ.git", // Temporarily clone the main repo until Axodex gets its own public URL, or we can use npm? 
    // Wait, let's just make the installer generic to take ANY git url.
    description: "Axodex Graph Intelligence Engine",
  }
};

/**
 * Installs an integration from a Git URL or registered name.
 */
export function installIntegration(target: string): void {
  console.log(`\n${C.BL}[Axoniz Installer]${C.R} Preparing to install integration: ${C.CY}${target}${C.R}`);

  if (!fs.existsSync(INTEGRATIONS_DIR)) {
    fs.mkdirSync(INTEGRATIONS_DIR, { recursive: true });
    logger.info(`Created integrations directory at ${INTEGRATIONS_DIR}`);
  }

  // Handle known shortcuts vs raw Git URLs
  let repoUrl = target;
  let dirName = target.split("/").pop()?.replace(".git", "") || "unknown_integration";

  if (REGISTRY[target.toLowerCase()]) {
    const manifest = REGISTRY[target.toLowerCase()]!;
    repoUrl = manifest.repo;
    dirName = manifest.name;
    console.log(`  ${C.DG}Resolved ${target} to official registry: ${repoUrl}${C.R}`);
  } else if (!target.startsWith("http") && !target.startsWith("git")) {
    console.error(`  ${C.RD}[-] Unknown integration '${target}'. Please provide a valid Git URL or registered name.${C.R}`);
    process.exitCode = 1;
    return;
  }

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
    
    // Auto-run npm install if package.json exists
    if (fs.existsSync(path.join(installPath, "package.json"))) {
      console.log(`  ${C.DG}Found package.json, running npm install...${C.R}`);
      execSync("npm install", { cwd: installPath, stdio: "inherit" });
    }

    // Auto-run build if tsconfig exists
    if (fs.existsSync(path.join(installPath, "tsconfig.json"))) {
      console.log(`  ${C.DG}Found tsconfig.json, running npm run build...${C.R}`);
      try {
        execSync("npm run build", { cwd: installPath, stdio: "inherit" });
      } catch {
        /* Ignore build script absence */
        console.log(`  ${C.DG}No default build script found, skipping compilation.${C.R}`);
      }
    }

    console.log(`\n  ${C.OK}[+] Successfully installed ${dirName} to ~/.axoniz/integrations/${dirName}${C.R}\n`);
  } catch (e) {
    console.error(`  ${C.RD}[-] Installation failed: ${String(e)}${C.R}`);
    process.exitCode = 1;
  }
}
