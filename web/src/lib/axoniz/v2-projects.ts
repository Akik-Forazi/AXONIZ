/**
 * AXONIZ v2 — project registration + auto-detection.
 *
 * A "project" is just a folder the user pointed AXONIZ at. We scan it,
 * detect what's there (git, package manager, language, framework), and
 * register it under ~/.axoniz/projects/:id/.
 *
 * No sandbox. No capability tokens. The folder is the scope.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { ProjectMetaSchema, type ProjectMeta } from "./v2-schemas";

const AXONIZ_HOME = path.join(os.homedir(), ".axoniz");
const PROJECTS_DIR = path.join(AXONIZ_HOME, "projects");
const PROJECTS_DB = path.join(AXONIZ_HOME, "db", "projects.json");

/* ─── Auto-detection ────────────────────────────────────────────────────
 * Sniffs the folder to figure out what kind of project it is. Reads
 * package.json, pyproject.toml, Cargo.toml, go.mod, .git/config.
 * Returns a typed ProjectMeta.detected object.
 */
export function detectProject(absPath: string): ProjectMeta["detected"] {
  const detected: ProjectMeta["detected"] = {
    isGitRepo: false,
    gitRemote: null,
    packageManager: null,
    language: null,
    framework: null,
    hasTests: false,
    hasDockerfile: false,
  };

  try {
    // Git
    detected.isGitRepo = fs.existsSync(path.join(absPath, ".git"));
    if (detected.isGitRepo) {
      try {
        const gitConfig = fs.readFileSync(path.join(absPath, ".git", "config"), "utf-8");
        const remoteMatch = gitConfig.match(/url\s*=\s*(\S+)/);
        if (remoteMatch) detected.gitRemote = remoteMatch[1];
      } catch { /* ignore */ }
    }

    // Node ecosystem
    if (fs.existsSync(path.join(absPath, "package.json"))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(absPath, "package.json"), "utf-8"));
      if (fs.existsSync(path.join(absPath, "pnpm-lock.yaml"))) detected.packageManager = "pnpm";
      else if (fs.existsSync(path.join(absPath, "yarn.lock"))) detected.packageManager = "yarn";
      else if (fs.existsSync(path.join(absPath, "bun.lockb"))) detected.packageManager = "bun";
      else detected.packageManager = "npm";

      detected.language = pkg.devDependencies?.typescript || pkg.dependencies?.typescript ? "typescript" : "javascript";
      // Framework detection
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (allDeps.next) detected.framework = "next.js";
      else if (allDeps.react) detected.framework = "react";
      else if (allDeps.vue) detected.framework = "vue";
      else if (allDeps.svelte) detected.framework = "svelte";
      else if (allDeps.express) detected.framework = "express";
      else if (allDeps.fastify) detected.framework = "fastify";
      else if (allDeps.hono) detected.framework = "hono";

      // Test detection
      detected.hasTests = !!(allDeps.jest || allDeps.vitest || allDeps["@testing-library/jest-dom"] || allDeps.playwright || allDeps.cypress || fs.existsSync(path.join(absPath, "test")) || fs.existsSync(path.join(absPath, "tests")));
    }
    // Python
    else if (fs.existsSync(path.join(absPath, "pyproject.toml")) || fs.existsSync(path.join(absPath, "requirements.txt"))) {
      detected.packageManager = "pip";
      detected.language = "python";
      try {
        const pyproject = fs.readFileSync(path.join(absPath, "pyproject.toml"), "utf-8");
        if (pyproject.includes("django")) detected.framework = "django";
        else if (pyproject.includes("fastapi")) detected.framework = "fastapi";
        else if (pyproject.includes("flask")) detected.framework = "flask";
      } catch { /* ignore */ }
    }
    // Rust
    else if (fs.existsSync(path.join(absPath, "Cargo.toml"))) {
      detected.packageManager = "cargo";
      detected.language = "rust";
    }
    // Go
    else if (fs.existsSync(path.join(absPath, "go.mod"))) {
      detected.packageManager = "go";
      detected.language = "go";
    }
    else {
      detected.language = "unknown";
    }

    // Docker
    detected.hasDockerfile = fs.existsSync(path.join(absPath, "Dockerfile")) || fs.existsSync(path.join(absPath, "docker-compose.yml"));
  } catch (e) {
    // Don't fail registration if detection fails — just record what we have.
    console.warn("[detectProject] partial failure:", e instanceof Error ? e.message : String(e));
  }

  return detected;
}

/* ─── Project store ────────────────────────────────────────────────────
 * Simple JSON file at ~/.axoniz/db/projects.json. Map of project_id → ProjectMeta.
 * (Could use SQLite, but for the typical case of <100 projects, JSON is fine.)
 */
function ensureDirs() {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PROJECTS_DB), { recursive: true });
}

function loadAllProjects(): Record<string, ProjectMeta> {
  ensureDirs();
  try {
    if (fs.existsSync(PROJECTS_DB)) {
      const raw = JSON.parse(fs.readFileSync(PROJECTS_DB, "utf-8"));
      return raw as Record<string, ProjectMeta>;
    }
  } catch { /* corrupt — start fresh */ }
  return {};
}

function saveAllProjects(projects: Record<string, ProjectMeta>) {
  ensureDirs();
  fs.writeFileSync(PROJECTS_DB, JSON.stringify(projects, null, 2), "utf-8");
}

function slugifyName(absPath: string): string {
  const base = path.basename(absPath).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Disambiguate if there's already a project with this slug.
  const all = loadAllProjects();
  if (!all[base]) return base;
  let i = 2;
  while (all[`${base}-${i}`]) i++;
  return `${base}-${i}`;
}

/* ─── Public API ─────────────────────────────────────────────────────── */
export function registerProject(folderPath: string): ProjectMeta {
  const absPath = path.resolve(folderPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Path does not exist: ${absPath}`);
  }
  if (!fs.statSync(absPath).isDirectory()) {
    throw new Error(`Path is not a directory: ${absPath}`);
  }

  // Check for duplicate by absolute path
  const all = loadAllProjects();
  const existingByPath = Object.values(all).find(p => p.path === absPath);
  if (existingByPath) {
    // Re-scan and update
    existingByPath.detected = detectProject(absPath);
    existingByPath.lastScannedAt = Date.now();
    saveAllProjects(all);
    return existingByPath;
  }

  const id = slugifyName(absPath);
  const project: ProjectMeta = {
    id,
    path: absPath,
    name: path.basename(absPath),
    registeredAt: Date.now(),
    lastScannedAt: Date.now(),
    detected: detectProject(absPath),
    palaceEnabled: true,
  };

  // Validate
  ProjectMetaSchema.parse(project);

  // Persist
  all[id] = project;
  saveAllProjects(all);

  // Create project workspace directory
  const projDir = path.join(PROJECTS_DIR, id);
  fs.mkdirSync(projDir, { recursive: true });
  fs.mkdirSync(path.join(projDir, "workflows"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "palace"), { recursive: true });

  return project;
}

export function listProjects(): ProjectMeta[] {
  return Object.values(loadAllProjects()).sort((a, b) => b.registeredAt - a.registeredAt);
}

export function getProject(id: string): ProjectMeta | null {
  return loadAllProjects()[id] ?? null;
}

export function unregisterProject(id: string): boolean {
  const all = loadAllProjects();
  if (!all[id]) return false;
  delete all[id];
  saveAllProjects(all);
  // Don't delete the project workspace dir — user might want to keep logs.
  // They can manually delete ~/.axoniz/projects/:id/ if they want.
  return true;
}
