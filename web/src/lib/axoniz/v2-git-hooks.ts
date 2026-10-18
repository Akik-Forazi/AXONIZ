/**
 * v2 git hooks — install git hooks that trigger workflows.
 *
 * Creates hook scripts in <project>/.git/hooks/ that call
 * `axoniz workflow run <name> --project <id>` on git events.
 *
 * Supported hooks:
 *   post-commit  → runs after every git commit
 *   pre-push     → runs before git push (can block)
 *   post-merge   → runs after git merge/pull
 */
import fs from "node:fs";
import path from "node:path";
import { getProject } from "./v2-projects";

type HookEvent = "post_commit" | "pre_push" | "post_merge";

const HOOK_MAP: Record<HookEvent, string> = {
  post_commit: "post-commit",
  pre_push: "pre-push",
  post_merge: "post-merge",
};

/** Install a git hook for a workflow. */
export function installGitHook(projectId: string, event: HookEvent, workflowName: string): string {
  const project = getProject(projectId);
  if (!project) throw new Error(`project not found: ${projectId}`);
  if (!project.detected.isGitRepo) throw new Error("project is not a git repo");

  const hookFile = path.join(project.path, ".git", "hooks", HOOK_MAP[event]);
  const hookDir = path.dirname(hookFile);
  fs.mkdirSync(hookDir, { recursive: true });

  const hookScript = `#!/bin/sh
# AXONIZ auto-generated git hook
# Workflow: ${workflowName}
# Event: ${event}
# Project: ${projectId}
# Installed: ${new Date().toISOString()}

# Run the workflow (non-blocking — won't fail the git operation)
axoniz workflow run ${workflowName} --project ${projectId} --trigger git_hook 2>/dev/null &
echo "[axoniz] triggered workflow '${workflowName}' (${event})"
`;

  fs.writeFileSync(hookFile, hookScript, { mode: 0o755 });
  return hookFile;
}

/** List installed git hooks for a project. */
export function listGitHooks(projectId: string): Array<{ event: HookEvent; file: string; workflow: string }> {
  const project = getProject(projectId);
  if (!project || !project.detected.isGitRepo) return [];

  const hooksDir = path.join(project.path, ".git", "hooks");
  if (!fs.existsSync(hooksDir)) return [];

  const result: Array<{ event: HookEvent; file: string; workflow: string }> = [];
  for (const [event, filename] of Object.entries(HOOK_MAP) as [HookEvent, string][]) {
    const hookPath = path.join(hooksDir, filename);
    if (fs.existsSync(hookPath)) {
      const content = fs.readFileSync(hookPath, "utf-8");
      const wfMatch = content.match(/Workflow: (.+)/);
      result.push({
        event,
        file: hookPath,
        workflow: wfMatch?.[1]?.trim() ?? "(unknown)",
      });
    }
  }
  return result;
}

/** Remove a git hook. */
export function removeGitHook(projectId: string, event: HookEvent): boolean {
  const project = getProject(projectId);
  if (!project || !project.detected.isGitRepo) return false;
  const hookFile = path.join(project.path, ".git", "hooks", HOOK_MAP[event]);
  if (!fs.existsSync(hookFile)) return false;
  // Only remove if it's an AXONIZ hook (check for the marker)
  const content = fs.readFileSync(hookFile, "utf-8");
  if (!content.includes("AXONIZ auto-generated")) return false;
  fs.unlinkSync(hookFile);
  return true;
}
