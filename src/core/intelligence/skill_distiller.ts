/**
 * axoniz.core.intelligence.skill_distiller
 * ========================================
 * The heart of AXONIZ's self-evolution.
 * Analyzes successful trajectories and distills them into permanent 'Skills'.
 *
 * A 'Skill' in AXONIZ is a self-contained Python function registered as a tool.
 * This is more robust than Hermes's skills (which are just prompt injections).
 * AXONIZ skills are real code, making them faster, more reliable, and zero-context.
 *
 * Port notes (Python → Node):
 *   - `analyze_session` / `_propose_skill` are `async` because the LLM call is
 *     asynchronous in the Node port. `distill` stays synchronous (it only
 *     writes a file).
 *   - `SKILL_TEMPLATE.format(...)` → `renderSkillTemplate()`, a single-pass
 *     `String.replace` over the same template text. A single pass matters:
 *     LLM-generated `body`/`schema` values frequently contain `{`/`}` and must
 *     never be re-scanned as placeholders.
 *   - `time.strftime("%Y-%m-%d")` is LOCAL time → local date parts (NOT
 *     `toISOString()`, which is UTC).
 */

import fs from "node:fs";
import path from "node:path";

import { AXONIZ_HOME } from "../config.js";
import { error, info } from "../debug.js";

export const SKILLS_DIR = path.join(AXONIZ_HOME, "skills");
try {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
} catch {
  /* best effort, mirrors makedirs(exist_ok=True) */
}

/**
 * Python value of the triple-quoted `SKILL_TEMPLATE` (i.e. it starts with a
 * newline followed by `"""` and ends after the closing `)` plus a newline).
 * Fill it with `renderSkillTemplate()`.
 */
export const SKILL_TEMPLATE = `
"""
AXONIZ Skill: {name}
Generated: {date}
Description: {description}
"""

from tools.registry import registry

def {name}({args_call}) -> str:
    """
    {description}
    """
    # Skill logic extracted from trajectory...
    {body}

registry.register(
    name="{name}",
    toolset="user_skills",
    schema={schema},
    handler=lambda args, **kw: {name}(**args),
    emoji="🛡️",
)
`;

export interface SkillTemplateVars {
  name: string;
  date: string;
  description: string;
  args_call: string;
  body: string;
  schema: string;
}

/**
 * Replacement for Python's `SKILL_TEMPLATE.format(...)`.
 * Unknown placeholders are left untouched (Python raised `KeyError` instead);
 * the substitution is a single pass so injected code can never be interpreted
 * as a placeholder.
 */
export function renderSkillTemplate(vars: SkillTemplateVars): string {
  const table = vars as unknown as Record<string, string>;
  return SKILL_TEMPLATE.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = table[key];
    return value === undefined ? whole : value;
  });
}

/** camelCase alias. */
export const render_skill_template = renderSkillTemplate;

export interface DistillProposal {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  code: string;
  [k: string]: unknown;
}

/** The subset of the Agent surface the distiller needs. */
export interface SkillAgent {
  trajectory?: {
    get_session_steps?(session_id: string): unknown[] | Promise<unknown[]>;
    getSessionSteps?(session_id: string): unknown[] | Promise<unknown[]>;
  };
  generate_summary?(prompt: string): string | Promise<string>;
  generateSummary?(prompt: string): string | Promise<string>;
  _rebuild_llm?(): unknown;
  _rebuildLlm?(): unknown;
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  return String(e);
}

/** Python's `time.strftime("%Y-%m-%d")` — local date. */
function localDate(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class SkillDistiller {
  agent: SkillAgent | null;

  constructor(agent: SkillAgent | null = null) {
    this.agent = agent;
  }

  /**
   * Analyzes a completed trajectory session for 'skill-able' patterns.
   * Criteria:
   * 1. Task was successful.
   * 2. Involved 5+ steps.
   * 3. Pattern is repetitive or complex.
   */
  async analyze_session(session_id: string): Promise<Record<string, unknown> | null> {
    const agent = this.agent;
    if (!agent || !agent.trajectory) {
      return null;
    }

    const traj = agent.trajectory;
    const fn = traj.get_session_steps ?? traj.getSessionSteps;
    if (!fn) return null;

    const raw = await fn.call(traj, session_id);
    const steps = Array.isArray(raw) ? raw : [];
    if (steps.length < 5) {
      return null;
    }

    // Logic to extract the 'essence' of the work...
    // We use the LLM to write the Python code for the new skill.
    return this._propose_skill(steps);
  }

  /** camelCase alias. */
  analyzeSession(session_id: string): Promise<Record<string, unknown> | null> {
    return this.analyze_session(session_id);
  }

  async _propose_skill(steps: unknown[]): Promise<Record<string, unknown> | null> {
    const prompt =
      `You are the AXONIZ Evolution Engine.\n` +
      `Analyze the following tool-calling trajectory and distill it into a reusable Python Skill.\n` +
      `A Skill is a single function that collapses these steps into one call.\n` +
      `\n` +
      `TRAJECTORY:\n` +
      `${JSON.stringify(steps, null, 2)}\n` +
      `\n` +
      `OUTPUT:\n` +
      `1. Skill Name (snake_case)\n` +
      `2. Description\n` +
      `3. Parameters (name, type, description)\n` +
      `4. Python Code (using existing axoniz tools or standard libs)\n` +
      `\n` +
      `Respond with JSON only.\n`;
    try {
      // Call primary LLM to generate the skill code
      const agent = this.agent;
      const fn = agent?.generate_summary ?? agent?.generateSummary;
      if (!agent || !fn) throw new Error("agent exposes no generate_summary");
      const proposal_raw = String((await fn.call(agent, prompt)) ?? "");
      const match = proposal_raw.match(/\{[\s\S]*\}/);
      if (!match) {
        error("[Distiller] LLM returned no JSON object in proposal");
        return null;
      }
      const proposal = JSON.parse(match[0]) as Record<string, unknown>;
      return proposal;
    } catch (e) {
      error(`[Distiller] Failed to propose skill: ${errText(e)}`);
      return null;
    }
  }

  /** camelCase alias. */
  _proposeSkill(steps: unknown[]): Promise<Record<string, unknown> | null> {
    return this._propose_skill(steps);
  }
  get pendingPath(): string {
    return path.join(SKILLS_DIR, "pending.json");
  }

  getPendingSkills(): Record<string, DistillProposal> {
    try {
      const data = fs.readFileSync(this.pendingPath, "utf-8");
      return JSON.parse(data) as Record<string, DistillProposal>;
    } catch {
      return {};
    }
  }

  savePendingSkills(skills: Record<string, DistillProposal>): void {
    fs.writeFileSync(this.pendingPath, JSON.stringify(skills, null, 2), "utf-8");
  }

  propose(proposal: DistillProposal): void {
    const skills = this.getPendingSkills();
    skills[proposal.name] = proposal;
    this.savePendingSkills(skills);
    info(`[Distiller] Skill '${proposal.name}' proposed and waiting for human review.`);
  }

  approve(name: string): boolean {
    const skills = this.getPendingSkills();
    if (!skills[name]) return false;
    const proposal = skills[name];
    this.distill(proposal);
    delete skills[name];
    this.savePendingSkills(skills);
    return true;
  }

  reject(name: string): boolean {
    const skills = this.getPendingSkills();
    if (!skills[name]) return false;
    delete skills[name];
    this.savePendingSkills(skills);
    info(`[Distiller] Skill '${name}' rejected.`);
    return true;
  }

  /** Writes the new skill to the skills directory. */
  distill(proposal: DistillProposal): void {
    const name = proposal.name;
    const file = path.join(SKILLS_DIR, `${name}.py`);

    // Format the code...
    const code = renderSkillTemplate({
      name,
      date: localDate(),
      description: proposal.description,
      args_call: Object.keys(proposal.parameters ?? {}).join(", "),
      body: proposal.code,
      schema: JSON.stringify(this._build_schema(proposal)),
    });

    fs.writeFileSync(file, code, "utf-8");

    info(`[Distiller] New skill forged: ${name}`);
    // Rebuild the LLM so the agent reloads with new tool context on next run
    const agent = this.agent;
    const rebuild = agent?._rebuild_llm ?? agent?._rebuildLlm;
    if (agent && rebuild) {
      try {
        void Promise.resolve(rebuild.call(agent)).catch(() => undefined);
      } catch {
        /* rebuild failures must not break skill creation */
      }
    }
  }

  _build_schema(proposal: DistillProposal): {
    name: string;
    description: string;
    parameters: { type: string; properties: Record<string, unknown>; required: string[] };
  } {
    // Build OpenAI function schema from proposal
    return {
      name: proposal.name,
      description: proposal.description,
      parameters: {
        type: "object",
        properties: proposal.parameters,
        required: Object.keys(proposal.parameters ?? {}),
      },
    };
  }

  /** camelCase alias. */
  _buildSchema(proposal: DistillProposal): ReturnType<SkillDistiller["_build_schema"]> {
    return this._build_schema(proposal);
  }
}

