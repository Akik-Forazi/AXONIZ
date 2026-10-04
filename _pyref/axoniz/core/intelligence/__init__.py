"""
axoniz.core.intelligence
=========================
Self-aware execution engine — all phases.

Phase 1 (complete):
  TrajectoryStore    — records every tool call as behavioral experience
  ConfidenceScorer   — risk assessment before any action
  SelfCorrector      — detects errors and generates corrections

Phase 2 (complete):
  SwarmOrchestrator  — parallel sub-agent execution with critic+merger
  SwarmWorker        — independent task executor
  SwarmCritic        — result quality reviewer
  SwarmMerger        — output combiner

Phase 3 (complete):
  ASTIndexer         — real AST index: symbols, calls, imports, impact analysis

Phase 4 (complete):
  axonizDaemon       — background OS layer: file watcher, scheduled tasks
  FileWatcher        — mtime-based file change detection
  ScheduledTask      — cron-style task definition

Phase 5 (complete):
  PredictiveEngine   — intent prediction + behavioral analysis
  SessionAnalyzer    — mines trajectory for patterns
  HotspotTracker     — tracks problem files/functions
  IntentPredictor    — sequence-based next-action prediction
"""

from axoniz.core.intelligence.trajectory import TrajectoryStore, get_store
from axoniz.core.intelligence.confidence import ConfidenceScorer, assess_risk
from axoniz.core.intelligence.self_correction import SelfCorrector, classify_error, ErrorType
from axoniz.core.intelligence.swarm import (
    SwarmOrchestrator, SwarmWorker, SwarmCritic, SwarmMerger,
    SubTask, SwarmResult,
)
from axoniz.core.intelligence.ast_index import ASTIndexer, ImpactAnalysis, Symbol
from axoniz.core.intelligence.daemon import (
    axonizDaemon, FileWatcher, ScheduledTask, DaemonEvent,
)
from axoniz.core.intelligence.predictor import (
    PredictiveEngine, SessionAnalyzer, HotspotTracker,
    IntentPredictor, PredictedIntent,
)
from axoniz.core.intelligence.context_compressor import ContextCompressor
from axoniz.core.intelligence.skill_distiller import SkillDistiller, SKILL_TEMPLATE, SKILLS_DIR

__all__ = [
    # Phase 1
    "TrajectoryStore", "get_store",
    "ConfidenceScorer", "assess_risk",
    "SelfCorrector", "classify_error", "ErrorType",
    # Phase 2
    "SwarmOrchestrator", "SwarmWorker", "SwarmCritic", "SwarmMerger",
    "SubTask", "SwarmResult",
    # Phase 3
    "ASTIndexer", "ImpactAnalysis", "Symbol",
    # Phase 4
    "axonizDaemon", "FileWatcher", "ScheduledTask", "DaemonEvent",
    # Phase 5
    "PredictiveEngine", "SessionAnalyzer", "HotspotTracker",
    "IntentPredictor", "PredictedIntent",
    # Phase 6+
    "ContextCompressor",
    "SkillDistiller", "SKILL_TEMPLATE", "SKILLS_DIR",
]
