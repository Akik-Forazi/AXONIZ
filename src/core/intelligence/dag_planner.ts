/**
 * DAG Planner — produces a dependency-graph plan instead of a linear
 * list of steps. Enables parallel execution of independent steps.
 *
 * Replaces the linear PlanTask[] from loop.ts._plan() with DAGStep[]
 * where each step declares its dependencies. The topologicalSort()
 * method returns "waves" of steps that can run in parallel.
 *
 * Usage:
 *   const planner = new DAGPlanner(llmCallback);
 *   const steps = await planner.plan("audit auth flow and fix the JWT bug");
 *   const waves = planner.topologicalSort(steps);
 *   // waves = [[step1, step2], [step3], [step4, step5]]
 *   for (const wave of waves) {
 *     const results = await Promise.all(wave.map(s => execute(s)));
 *   }
 *
 * The planner uses the LLM to decompose the goal, then annotates each
 * step with its dependencies based on data flow (which steps produce
 * artifacts that other steps consume).
 */

export interface DAGStep {
  id: string;
  title: string;
  description?: string;
  /** Step IDs that must complete before this one can start. */
  dependsOn: string[];
  /** The role of the agent that should execute this step. */
  role?: "planner" | "researcher" | "coder" | "debugger" | "reviewer" | "tester" | "verifier" | "general";
  /** Estimated difficulty: 1 (trivial) to 5 (hard). */
  difficulty?: number;
  /** Whether this step can run in parallel with its siblings. */
  parallelizable: boolean;
  /** The verify condition (what must be true for this step to be "done"). */
  verify?: string;
  /** Optional: artifacts this step produces (consumed by dependent steps). */
  produces?: string[];
  /** Optional: artifacts this step consumes (produced by dependencies). */
  consumes?: string[];
}

export interface PlanResult {
  steps: DAGStep[];
  waves: DAGStep[][];
  estimatedDurationMs: number;
}

/** LLM callback type — takes a prompt, returns the LLM's text response. */
export type LLMCallback = (prompt: string) => Promise<string>;

const DAG_PLAN_PROMPT = `You are the DAG Planner. Decompose the goal into a list of steps, each with explicit dependencies.

Output STRICT JSON (no prose, no markdown fences):
{
  "steps": [
    {
      "id": "s1",
      "title": "short title",
      "description": "what to do",
      "dependsOn": [],
      "role": "researcher|coder|debugger|reviewer|tester|verifier|planner",
      "difficulty": 1-5,
      "verify": "what must be true for this step to be done",
      "produces": ["artifact1"],
      "consumes": []
    },
    {
      "id": "s2",
      "title": "...",
      "dependsOn": ["s1"],
      "consumes": ["artifact1"],
      ...
    }
  ]
}

Rules:
- IDs are s1, s2, s3, ... (sequential)
- dependsOn lists step IDs that MUST complete before this step
- A step with empty dependsOn can start immediately
- Steps that don't depend on each other will run in parallel
- Set role to the most specific agent that can do this step
- difficulty 1=trivial (read a file), 3=moderate (refactor a function), 5=hard (architectural change)
- produces/consumes track data flow (file paths, symbol names, test results)
- Keep plans to 8 steps max — if the goal needs more, decompose into sub-goals`;

export class DAGPlanner {
  constructor(private llm: LLMCallback) {}

  /** Plan a goal into a DAG of steps. */
  async plan(goal: string): Promise<PlanResult> {
    const raw = await this.llm(`${DAG_PLAN_PROMPT}\n\nGoal: ${goal}`);
    const steps = this.parseSteps(raw);
    const waves = this.topologicalSort(steps);
    const estimatedDurationMs = this.estimateDuration(steps, waves);
    return { steps, waves, estimatedDurationMs };
  }

  /**
   * Topologically sort the steps into "waves" — groups of steps that
   * can run in parallel. Wave 0 has no dependencies, wave 1 depends
   * only on wave 0, etc.
   *
   * Uses Kahn's algorithm. Throws on cycles.
   */
  topologicalSort(steps: DAGStep[]): DAGStep[][] {
    const byId = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const s of steps) {
      inDegree.set(s.id, 0);
      dependents.set(s.id, []);
    }

    // Count edges
    for (const s of steps) {
      for (const dep of s.dependsOn) {
        inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1);
        dependents.get(dep)?.push(s.id);
      }
    }

    // Wave 0: all steps with inDegree 0
    const waves: DAGStep[][] = [];
    let currentWave = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0);

    while (currentWave.length > 0) {
      waves.push(currentWave);
      const nextWave: DAGStep[] = [];
      for (const s of currentWave) {
        for (const dependentId of dependents.get(s.id) ?? []) {
          const newDeg = (inDegree.get(dependentId) ?? 1) - 1;
          inDegree.set(dependentId, newDeg);
          if (newDeg === 0) {
            const dep = byId.get(dependentId);
            if (dep) nextWave.push(dep);
          }
        }
      }
      currentWave = nextWave;
    }

    // Cycle check
    const totalSorted = waves.reduce((sum, w) => sum + w.length, 0);
    if (totalSorted !== steps.length) {
      throw new Error(
        `DAG cycle detected: ${steps.length - totalSorted} steps could not be sorted`,
      );
    }

    return waves;
  }

  /** Parse the LLM's JSON response into DAGStep[]. */
  private parseSteps(raw: string): DAGStep[] {
    // Try to extract JSON from the response (handles markdown fences)
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : raw;
    let parsed: { steps?: DAGStep[] };
    try {
      parsed = JSON.parse(jsonStr.trim());
    } catch {
      // Fallback: try to find a { ... } block
      const braceMatch = raw.match(/\{[\s\S]*\}/);
      if (!braceMatch) throw new Error("DAG Planner: could not parse LLM response as JSON");
      parsed = JSON.parse(braceMatch[0]);
    }

    const steps = parsed.steps ?? [];
    // Validate: every dependsOn entry must be a real step id
    const ids = new Set(steps.map((s) => s.id));
    for (const s of steps) {
      s.dependsOn = (s.dependsOn ?? []).filter((d) => ids.has(d));
      s.parallelizable = s.parallelizable ?? true;
      s.difficulty = s.difficulty ?? 3;
    }
    return steps;
  }

  /**
   * Estimate total wall-clock duration. Assumes steps in the same wave
   * run in parallel (take the max duration in the wave), waves run
   * sequentially (sum of wave durations).
   */
  private estimateDuration(steps: DAGStep[], waves: DAGStep[][]): number {
    // Rough: 500ms per difficulty point per step, +2s for LLM round-trips
    let total = 0;
    for (const wave of waves) {
      const waveDuration = Math.max(
        ...wave.map((s) => (s.difficulty ?? 3) * 500 + 2000),
      );
      total += waveDuration;
    }
    return total;
  }
}
