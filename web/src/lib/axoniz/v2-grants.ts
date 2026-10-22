/**
 * v2 grants — simple file-access approval system.
 *
 * When a workflow tool (file/shell) tries to access a path OUTSIDE
 * the project folder, the grants system is consulted:
 * - If a grant exists → allow
 * - If no grant → auto-allow with a log entry (in v2, we trust
 *   the user's workflows — full UI prompt would require async)
 *
 * Stored at ~/.fraziym/axoniz/grants.json — simple JSON, mode 0600.
 */
import fs from "node:fs";
import path from "node:path";
import { axonizHome } from "./paths";

const GRANTS_PATH = path.join(axonizHome(), "grants.json");

interface Grant {
  workflow: string;
  path: string;
  grantedAt: number;
  scope: "read" | "write" | "readwrite";
}

function loadGrants(): Grant[] {
  try {
    if (fs.existsSync(GRANTS_PATH)) {
      return JSON.parse(fs.readFileSync(GRANTS_PATH, "utf-8")) as Grant[];
    }
  } catch { /* corrupt */ }
  return [];
}

function saveGrants(grants: Grant[]): void {
  const dir = path.dirname(GRANTS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(GRANTS_PATH, JSON.stringify(grants, null, 2), { mode: 0o600 });
}

/** Check if a workflow is allowed to access a path. */
export function checkGrant(workflow: string, targetPath: string, scope: "read" | "write" | "readwrite" = "readwrite"): boolean {
  const grants = loadGrants();
  return grants.some(g =>
    g.workflow === workflow &&
    targetPath.startsWith(g.path) &&
    (g.scope === "readwrite" || g.scope === scope)
  );
}

/** Grant a workflow access to a path. */
export function grantAccess(workflow: string, targetPath: string, scope: "read" | "write" | "readwrite" = "readwrite"): void {
  const grants = loadGrants();
  if (!grants.some(g => g.workflow === workflow && g.path === targetPath)) {
    grants.push({ workflow, path: targetPath, grantedAt: Date.now(), scope });
    saveGrants(grants);
  }
}

/** Revoke a grant. */
export function revokeGrant(workflow: string, targetPath: string): boolean {
  const grants = loadGrants();
  const filtered = grants.filter(g => !(g.workflow === workflow && g.path === targetPath));
  if (filtered.length === grants.length) return false;
  saveGrants(filtered);
  return true;
}

/** List all grants. */
export function listGrants(): Grant[] {
  return loadGrants();
}

/** Check if a path is inside the project folder. */
export function isInsideProject(targetPath: string, projectPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const project = path.resolve(projectPath);
  return resolved.startsWith(project + path.sep) || resolved === project;
}
