/**
 * Tool Registry + Agent Definitions — per-role tool scoping.
 *
 * As of v0.3.6, AXONIZ supports scoped tool maps per agent role. Instead
 * of every agent getting the full ~80-tool arsenal (which is both a
 * security issue and a behavioral one — the LLM gets distracted by
 * irrelevant tools), agents can be instantiated with a specific role
 * that determines which tools they can invoke.
 *
 * Usage:
 *   const def = ToolRegistry.get("coder");
 *   const scopedMap = ToolRegistry.scopedToolMap("coder", agent.toolMap);
 *   // scopedMap only contains the tools listed in AGENT_DEFINITIONS.coder.tools
 *
 * The agent.ts loop checks the scoped map instead of the full map when
 * a role is set. If no role is set, the full map is used (backwards-compat).
 */

import type { ToolFn } from "./agent.js";

export type AgentRole =
  | "planner"
  | "researcher"
  | "coder"
  | "debugger"
  | "reviewer"
  | "tester"
  | "verifier"
  | "general";

export interface AgentDefinition {
  /** Canonical name for the role. */
  name: string;
  /** Machine role id. */
  role: AgentRole;
  /** What this agent does — shown to the LLM in the system prompt. */
  description: string;
  /** Allowlist of tool names this role can invoke. */
  tools: string[];
  /** Optional extra system prompt to inject when this role is active. */
  systemPrompt?: string;
  /** Whether this role can invoke destructive tools (file_delete, shell_run with rm, etc.). */
  canDestroy: boolean;
  /** Whether this role can invoke network tools (web_get, web_search, package installs). */
  canAccessNetwork: boolean;
}

/**
 * Pre-defined agent roles with tool allowlists.
 *
 * The tool names here must match the keys registered in Agent.registerTools().
 * If a tool name in the allowlist isn't in the full tool map, it's silently
 * skipped (so adding new tools doesn't break old definitions).
 */
export const AGENT_DEFINITIONS: Record<AgentRole, AgentDefinition> = {
  planner: {
    name: "Planner",
    role: "planner",
    description: "Decomposes goals into steps. Read-only access to the codebase via axodex + file reads. Cannot edit files or run shell commands.",
    tools: [
      "file_read", "file_list", "file_search",
      "axodex_query", "axodex_context", "axodex_smart_read", "axodex_impact", "axodex_status",
      "memory_recall", "memory_search",
      "done",
    ],
    canDestroy: false,
    canAccessNetwork: false,
    systemPrompt: "You are the Planner. Read the codebase, understand the goal, and produce a concrete step-by-step plan. Do NOT edit files or run commands — that's for downstream agents.",
  },

  researcher: {
    name: "Researcher",
    role: "researcher",
    description: "Gathers information from the codebase and the web. Read-only. Cannot edit files or run shell commands.",
    tools: [
      "file_read", "file_list", "file_search",
      "code_tree", "code_analyze",
      "axodex_query", "axodex_context", "axodex_smart_read", "axodex_impact", "axodex_detect_changes", "axodex_status", "axodex_analyze",
      "web_get", "web_search",
      "memory_recall", "memory_search", "palace_status",
      "done",
    ],
    canDestroy: false,
    canAccessNetwork: true,
    systemPrompt: "You are the Researcher. Gather information from the codebase (via axodex + file reads) and the web. Report findings — do NOT edit files or run commands.",
  },

  coder: {
    name: "Coder",
    role: "coder",
    description: "Writes and edits code. Has file edit + code tools + axodex for context. Cannot run shell commands or install packages.",
    tools: [
      "file_read", "file_write", "file_edit", "file_append", "file_list", "file_search",
      "code_lint", "code_format", "code_tree", "code_analyze",
      "axodex_query", "axodex_context", "axodex_smart_read", "axodex_impact", "axodex_detect_changes", "axodex_status",
      "memory_recall", "memory_search",
      "done",
    ],
    canDestroy: false,
    canAccessNetwork: false,
    systemPrompt: "You are the Coder. Write and edit code. Use axodex for architectural context. After edits, the verify gate will run tsc + eslint — you don't need to run them yourself.",
  },

  debugger: {
    name: "Debugger",
    role: "debugger",
    description: "Diagnoses failures. Has read + shell tools (for running tests/logs) + axodex. Can read files and run non-destructive shell commands.",
    tools: [
      "file_read", "file_list", "file_search",
      "code_lint", "code_tree", "code_analyze",
      "shell_run",
      "axodex_query", "axodex_context", "axodex_smart_read", "axodex_impact", "axodex_detect_changes", "axodex_status",
      "memory_recall", "memory_search",
      "done",
    ],
    canDestroy: false,
    canAccessNetwork: false,
    systemPrompt: "You are the Debugger. Diagnose the failure — read files, run tests, inspect logs. Propose a fix but do NOT apply it (that's for the Coder).",
  },

  reviewer: {
    name: "Reviewer",
    role: "reviewer",
    description: "Reviews code changes. Read-only + git tools to see diffs. Cannot edit files.",
    tools: [
      "file_read", "file_list", "file_search",
      "code_lint", "code_tree", "code_analyze",
      "git_diff", "git_log", "git_status",
      "axodex_query", "axodex_context", "axodex_smart_read", "axodex_impact", "axodex_detect_changes",
      "done",
    ],
    canDestroy: false,
    canAccessNetwork: false,
    systemPrompt: "You are the Reviewer. Review the code changes (via git diff) and assess: correctness, security, performance, style. Report issues — do NOT edit files.",
  },

  tester: {
    name: "Tester",
    role: "tester",
    description: "Writes and runs tests. Has file write (for test files) + shell (for running tests) + code tools.",
    tools: [
      "file_read", "file_write", "file_edit", "file_list", "file_search",
      "code_lint", "code_tree",
      "shell_run", "shell_python",
      "axodex_query", "axodex_context", "axodex_smart_read",
      "done",
    ],
    canDestroy: false,
    canAccessNetwork: false,
    systemPrompt: "You are the Tester. Write test files and run them. Report pass/fail counts and any failures.",
  },

  verifier: {
    name: "Verifier",
    role: "verifier",
    description: "Runs the verify gate (tsc, eslint, vitest, pytest). Read-only + shell for running checks.",
    tools: [
      "file_read", "file_list",
      "shell_run",
      "code_lint", "code_analyze",
      "axodex_detect_changes", "axodex_status",
      "done",
    ],
    canDestroy: false,
    canAccessNetwork: false,
    systemPrompt: "You are the Verifier. Run the verify gate (tsc, eslint, vitest, pytest) and report results. Do NOT edit files.",
  },

  general: {
    name: "General Agent",
    role: "general",
    description: "Full tool access. Used when no specific role is set (backwards-compat with pre-v0.3.6 behavior).",
    tools: [], // empty = all tools
    canDestroy: true,
    canAccessNetwork: true,
  },
};

export class ToolRegistry {
  private static definitions = new Map<AgentRole, AgentDefinition>(
    Object.entries(AGENT_DEFINITIONS).map(([k, v]) => [k as AgentRole, v]),
  );

  /** Register a custom agent definition (overrides built-in if same role). */
  static register(def: AgentDefinition): void {
    ToolRegistry.definitions.set(def.role, def);
  }

  /** Get a definition by role. Returns null if role not found. */
  static get(role: AgentRole | string): AgentDefinition | null {
    return ToolRegistry.definitions.get(role as AgentRole) ?? null;
  }

  /** List all registered roles. */
  static roles(): AgentRole[] {
    return Array.from(ToolRegistry.definitions.keys());
  }

  /**
   * Returns a scoped tool map containing only the tools in the role's
   * allowlist. If the role is "general" or the allowlist is empty,
   * returns the full map (backwards-compat).
   *
   * Tools in the allowlist that aren't in the full map are silently
   * skipped — so adding new tool names to a definition doesn't break
   * if the tool isn't registered yet.
   */
  static scopedToolMap(
    role: AgentRole | string | null,
    fullToolMap: Map<string, ToolFn>,
  ): Map<string, ToolFn> {
    if (!role || role === "general") return fullToolMap;
    const def = ToolRegistry.get(role);
    if (!def || def.tools.length === 0) return fullToolMap;
    const scoped = new Map<string, ToolFn>();
    for (const toolName of def.tools) {
      const fn = fullToolMap.get(toolName);
      if (fn) scoped.set(toolName, fn);
    }
    return scoped;
  }

  /**
   * Returns the list of tool names available to a role. Useful for
   * building the system prompt ("You have access to: file_read, file_write, ...").
   */
  static toolNamesForRole(role: AgentRole | string | null): string[] {
    if (!role || role === "general") return [];
    const def = ToolRegistry.get(role);
    return def?.tools ?? [];
  }
}
