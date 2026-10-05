/**
 * AXONIZ-ZERO · Goal Types
 * Port of `axoniz/goals/types.py`.
 *
 * The Python source declares two `str`-Enum classes. A string enum's members
 * compare equal to their raw string values, so the faithful ESM translation is a
 * frozen const object plus a matching union type — this keeps
 * `GoalStatus.ACTIVE` usable as a value *and* `GoalStatus` usable as a type,
 * exactly like the Python enum, while still allowing plain-string comparisons
 * (`goal.status === "active"`).
 *
 * Python's `GoalStatus("active")` enum-lookup constructor (used by
 * `goals/service.py` when reading rows) is provided as `asGoalStatus()` /
 * `asGoalPriority()`, which raise the same `ValueError`-style message.
 */

/* ── Status ───────────────────────────────────────────────────────────────── */

export const GoalStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  DONE: "done",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus];

/** Declaration order preserved from the Python enum (used for validation). */
export const GOAL_STATUS_VALUES = [
  "active",
  "paused",
  "done",
  "completed",
  "cancelled",
] as const;

/* ── Priority ─────────────────────────────────────────────────────────────── */

export const GoalPriority = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type GoalPriority = (typeof GoalPriority)[keyof typeof GoalPriority];

/** Declaration order preserved from the Python enum (used for validation). */
export const GOAL_PRIORITY_VALUES = ["critical", "high", "medium", "low"] as const;

/* ── Coercion helpers (Python's `GoalStatus(value)` / `GoalPriority(value)`) ─ */

export function isGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && (GOAL_STATUS_VALUES as readonly string[]).includes(value);
}

export function isGoalPriority(value: unknown): value is GoalPriority {
  return typeof value === "string" && (GOAL_PRIORITY_VALUES as readonly string[]).includes(value);
}

/**
 * Equivalent of `GoalStatus(value)`.
 * Raises ValueError in Python: `'<value>' is not a valid GoalStatus`.
 */
export function asGoalStatus(value: string): GoalStatus {
  if (isGoalStatus(value)) return value;
  throw new Error(`'${value}' is not a valid GoalStatus`);
}

/**
 * Equivalent of `GoalPriority(value)`.
 * Raises ValueError in Python: `'<value>' is not a valid GoalPriority`.
 */
export function asGoalPriority(value: string): GoalPriority {
  if (isGoalPriority(value)) return value;
  throw new Error(`'${value}' is not a valid GoalPriority`);
}
