/**
 * AXONIZ-ZERO · Goals package barrel
 * Port of `axoniz/goals/__init__.py`.
 */
export {
  GoalService,
  get_goal_service,
  getGoalService,
  _reset_goal_service,
  Goal,
  KeyResult,
  DailyAction,
  GOALS_DB,
  type GoalInit,
  type KeyResultInit,
  type DailyActionInit,
  type GoalConcern,
} from "./service.js";

export {
  GoalStatus,
  GoalPriority,
  GOAL_STATUS_VALUES,
  GOAL_PRIORITY_VALUES,
  isGoalStatus,
  isGoalPriority,
  asGoalStatus,
  asGoalPriority,
} from "./types.js";

/** Mirrors `__all__` in the Python `__init__`. */
export const __all__ = [
  "GoalService",
  "get_goal_service",
  "Goal",
  "KeyResult",
  "DailyAction",
  "GoalStatus",
  "GoalPriority",
] as const;
