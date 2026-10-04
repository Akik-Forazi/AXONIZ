/**
 * axoniz.core.intelligence
 * =========================
 * Self-aware execution engine — all phases.
 *
 * Phase 1 (complete):
 *   TrajectoryStore    — records every tool call as behavioral experience
 *   ConfidenceScorer   — risk assessment before any action
 *   SelfCorrector      — detects errors and generates corrections
 *
 * Phase 2 (complete):
 *   SwarmOrchestrator  — parallel sub-agent execution with critic+merger
 *   SwarmWorker        — independent task executor
 *   SwarmCritic        — result quality reviewer
 *   SwarmMerger        — output combiner
 *
 * Phase 3 (complete):
 *   ASTIndexer         — real AST index: symbols, calls, imports, impact analysis
 *
 * Phase 4 (complete):
 *   axonizDaemon       — background OS layer: file watcher, scheduled tasks
 *   FileWatcher        — mtime-based file change detection
 *   ScheduledTask      — interval-style task definition
 *
 * Phase 5 (complete):
 *   PredictiveEngine   — intent prediction + behavioral analysis
 *   SessionAnalyzer    — mines trajectory for patterns
 *   HotspotTracker     — tracks problem files/functions
 *   IntentPredictor    — sequence-based next-action prediction
 *
 * This module mirrors `axoniz/core/intelligence/__init__.py`: the same public
 * names (snake_case, as the rest of the ported codebase references them) plus
 * camelCase aliases for the TypeScript-idiomatic spelling of each function.
 */

/* ── Phase 1: trajectory ──────────────────────────────────────────────────── */

export {
  TrajectoryStore,
  get_store,
  getStore,
  TRAJECTORY_DB,
  nowSeconds,
  dumpArgs,
} from "./trajectory.js";
export type { TrajectoryRow } from "./trajectory.js";

/* ── Phase 1: confidence ──────────────────────────────────────────────────── */

export { ConfidenceScorer, assess_risk, assessRisk, pyStr, pct } from "./confidence.js";
export type {
  CheckResult,
  ConfidenceScorerOptions,
  RiskAssessment,
  TrajectoryLike,
} from "./confidence.js";

/* ── Phase 1: self correction ─────────────────────────────────────────────── */

export {
  SelfCorrector,
  classify_error,
  classifyError,
  classify_api_error,
  classifyApiError,
  ErrorType,
  APIFailoverReason,
} from "./self_correction.js";
export type {
  CorrectionAnalysis,
  ErrorClassification,
  ErrorHistoryEntry,
} from "./self_correction.js";

/* ── Phase 2: swarm ───────────────────────────────────────────────────────── */

export {
  SwarmOrchestrator,
  SwarmWorker,
  SwarmCritic,
  SwarmMerger,
  SubTask,
  SwarmResult,
  DECOMPOSE_PROMPT,
  CRITIC_PROMPT,
  MERGE_PROMPT,
  collectStream,
  errText,
} from "./swarm.js";
export type {
  CriticReview,
  ParsedToolCall,
  ProgressCallback,
  SubTaskInit,
  SwarmAgent,
  SwarmLLM,
  SwarmOrchestratorInit,
  SwarmResultInit,
  SwarmWorkerInit,
  ToolArgsMode,
  ToolHandler,
  ToolMap,
} from "./swarm.js";

/* ── Phase 3: AST index ───────────────────────────────────────────────────── */

export {
  ASTIndexer,
  ImpactAnalysis,
  Symbol,
  CallSite,
  AST_INDEX_DIR,
  INDEX_EXTENSIONS,
  _extract_symbols,
} from "./ast_index.js";
export type {
  AstStats,
  CallSiteInit,
  Extraction,
  ExtractedCall,
  ExtractedImport,
  ExtractedSymbol,
  ImpactAnalysisInit,
  IndexStats,
  SymbolInit,
} from "./ast_index.js";

/* ── Phase 4: daemon ──────────────────────────────────────────────────────── */

export {
  axonizDaemon,
  FileWatcher,
  ScheduledTask,
  DaemonEvent,
  FileEvent,
  EventQueue,
  _pySyntaxIssue,
  _jsSyntaxIssue,
} from "./daemon.js";
export type {
  DaemonAgent,
  DaemonEventInit,
  FileEventInit,
  ScheduledTaskInit,
  SyntaxIssue,
} from "./daemon.js";

/* ── Phase 5: predictor ───────────────────────────────────────────────────── */

export {
  PredictiveEngine,
  SessionAnalyzer,
  HotspotTracker,
  IntentPredictor,
  PredictedIntent,
  PredictiveContext,
  BehaviorPattern,
  Hotspot,
} from "./predictor.js";
export type {
  BehaviorPatternInit,
  HotspotInit,
  PredictedIntentInit,
  PredictiveAgent,
  PredictivePalace,
  TrajectoryQueryable,
} from "./predictor.js";

/* ── Phase 6+: context compression ────────────────────────────────────────── */

export { ContextCompressor, SUMMARY_PREFIX } from "./context_compressor.js";
export type {
  CompressionMessage,
  ContextCompressorOptions,
  SummaryAgent,
} from "./context_compressor.js";

/* ── Phase 11: skill distillation ─────────────────────────────────────────── */

export {
  SkillDistiller,
  SKILL_TEMPLATE,
  SKILLS_DIR,
  renderSkillTemplate,
} from "./skill_distiller.js";
export type {
  DistillProposal,
  SkillAgent,
  SkillTemplateVars,
} from "./skill_distiller.js";

/* ── Reflex engine (imported directly from its submodule in Python) ───────── */

export { ShadowGuardReflex, ReflexBrain } from "./reflex.js";
export type {
  ReflexAgent,
  ReflexComputerTools,
  ReflexPipeline,
} from "./reflex.js";

/* ── PEAK advancements (v0.3.6) ─────────────────────────────────────────── */

export { CostTracker } from "./cost_tracker.js";
export type {
  CostTrackerPricing,
  ToolCallCost,
  LLMCallCost,
  TaskCostTotal,
  CostEvent,
} from "./cost_tracker.js";

export { VerifyGate } from "./verify_gate.js";
export type {
  VerifyCheck,
  VerifyResult,
  VerifyCheckName,
} from "./verify_gate.js";

export { DAGPlanner } from "./dag_planner.js";
export type {
  DAGStep,
  PlanResult,
  LLMCallback,
} from "./dag_planner.js";

// Semantic context compression (enhanced methods on the existing
// ContextCompressor class — scoreImportance, semanticKeepMask,
// compressSemantic). The re-export above already covers
// ContextCompressor + SUMMARY_PREFIX; no new top-level export needed.

/**
 * Python's `__all__`, extended with the camelCase aliases this port adds so
 * consumers can keep using the Python spelling verbatim.
 */
export const __all__: string[] = [
  // Phase 1
  "TrajectoryStore",
  "get_store",
  "getStore",
  "ConfidenceScorer",
  "assess_risk",
  "assessRisk",
  "SelfCorrector",
  "classify_error",
  "classifyError",
  "ErrorType",
  // Phase 2
  "SwarmOrchestrator",
  "SwarmWorker",
  "SwarmCritic",
  "SwarmMerger",
  "SubTask",
  "SwarmResult",
  // Phase 3
  "ASTIndexer",
  "ImpactAnalysis",
  "Symbol",
  // Phase 4
  "axonizDaemon",
  "FileWatcher",
  "ScheduledTask",
  "DaemonEvent",
  // Phase 5
  "PredictiveEngine",
  "SessionAnalyzer",
  "HotspotTracker",
  "IntentPredictor",
  "PredictedIntent",
  // Phase 6+
  "ContextCompressor",
  "SkillDistiller",
  "SKILL_TEMPLATE",
  "SKILLS_DIR",
  // Reflex engine
  "ShadowGuardReflex",
];
