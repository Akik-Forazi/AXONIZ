/**
 * AXONIZ Persona Engine — concise identity and role system.
 * Loads roles from YAML and builds compact system prompts.
 * Port of axoniz/core/persona.py (PyYAML -> js-yaml).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { getLogger } from "./logger.js";

const logger = getLogger();

const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface RoleData {
  id?: string;
  name?: string;
  title?: string;
  personality?: string[];
  core_traits?: string[];
  authority_level?: number;
  sub_roles?: unknown[];
  heartbeat_instructions?: string;
  system_prompt_template?: string;
  [key: string]: unknown;
}

const DEFAULT_ROLE: RoleData = {
  name: "AXONIZ",
  title: "AI Agent",
  personality: ["efficient", "analytical", "accountable"],
  system_prompt_template:
    "You are {name}, {title}.\n" +
    "Rules: read before edit, use tools only, verify after changes, summarize on done.\n" +
    "Tools: {tool_list}\n" +
    "Personality: {personality_list}",
  authority_level: 5,
  sub_roles: [],
  heartbeat_instructions: "Check system status and pending tasks.",
};

export class Persona {
  readonly roleId: string;
  readonly data: RoleData;
  readonly name: string;
  readonly title: string;
  readonly authorityLevel: number;
  readonly subRoles: unknown[];
  readonly heartbeatInstructions: string;

  constructor(role = "default") {
    this.roleId = role;
    this.data = this.loadRole(role);
    this.name = String(this.data.name ?? "AXONIZ");
    this.title = String(this.data.title ?? "AI Agent");
    this.authorityLevel = Number(this.data.authority_level ?? 5);
    this.subRoles = Array.isArray(this.data.sub_roles) ? this.data.sub_roles : [];
    this.heartbeatInstructions = String(
      this.data.heartbeat_instructions ??
        "Check system status, pending tasks, and trajectory health.",
    );
  }

  /** Candidate locations for the role YAML, mirroring the Python search order. */
  private rolePaths(roleId: string): string[] {
    return [
      path.join(HERE, "..", "roles", `${roleId}.yaml`),
      path.join(HERE, "..", "..", "roles", `${roleId}.yaml`),
      path.join(process.cwd(), "axoniz", "roles", `${roleId}.yaml`),
      path.join(process.cwd(), "roles", `${roleId}.yaml`),
    ];
  }

  private loadRole(roleId: string): RoleData {
    for (const p of this.rolePaths(roleId)) {
      if (!fs.existsSync(p)) continue;
      try {
        const data = yaml.load(fs.readFileSync(p, "utf-8")) as RoleData | undefined | null;
        if (data && typeof data === "object") return data;
      } catch (e) {
        logger.error(`Failed to load role ${roleId} from ${p}: ${errMsg(e)}`, "axoniz.persona");
      }
    }
    logger.warning(
      `[Persona] Role YAML '${roleId}.yaml' not found — using built-in default`,
      "axoniz.persona",
    );
    return structuredClone(DEFAULT_ROLE);
  }

  /**
   * Render the system prompt template.
   * Mirrors Python's str.format with a manual fallback for unknown keys.
   */
  buildSystemPrompt(workspace = ".", toolNames?: string[], sessionId = "default"): string {
    const template = String(
      this.data.system_prompt_template ?? DEFAULT_ROLE.system_prompt_template ?? "",
    );
    const personality = (Array.isArray(this.data.personality) ? this.data.personality : []).join(", ");
    const toolList = (toolNames ?? []).join(", ");

    const context: Record<string, string> = {
      name: this.name,
      title: this.title,
      personality_list: personality,
      workspace,
      session_id: sessionId,
      tool_list: toolList,
    };

    let prompt = template;
    let unknownKey: string | null = null;
    for (const [key, value] of Object.entries(context)) {
      const placeholder = `{${key}}`;
      if (!prompt.includes(placeholder)) continue;
      prompt = prompt.split(placeholder).join(value);
    }
    // Detect any remaining placeholders and warn like the Python KeyError branch.
    const leftover = prompt.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/);
    if (leftover) unknownKey = leftover[1];

    if (unknownKey) {
      logger.warning(
        `[Persona] template referenced unknown key '${unknownKey}', rendered with fallbacks`,
        "axoniz.persona",
      );
    }

    return prompt.trim();
  }

  buildHeartbeatPrompt(recentChat = ""): string {
    return `System check: ${this.heartbeatInstructions}\nRecent context:\n${recentChat}`;
  }

  getAuthorityLevel(action: string): number {
    if (action.includes("delete") || action.includes("format") || action.includes("dangerous")) {
      return 4;
    }
    if (action.includes("write")) return 2;
    return 1;
  }

  isAutonomous(action: string): boolean {
    return this.getAuthorityLevel(action) <= this.authorityLevel;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

let personaInstance: Persona | null = null;

export function getPersona(role = "default"): Persona {
  if (personaInstance === null || personaInstance.roleId !== role) {
    personaInstance = new Persona(role);
  }
  return personaInstance;
}
