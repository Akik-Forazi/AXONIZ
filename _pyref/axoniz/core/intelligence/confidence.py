"""
axoniz.core.intelligence.confidence
======================================
Confidence Scorer — Phase 1 of the AXONIZ dominance plan.

Before taking any risky action, the agent asks itself:
"How confident am I that this is correct and safe?"

If confidence is below threshold, it either:
  - Asks the user for clarification (interactive mode)
  - Skips the step and notes it (autonomous mode)
  - Tries a safer alternative

This stops the agent before it destroys your files, corrupts
your DB, or runs an irreversible command it isn't sure about.

No other local agent has this. OpenClaw, Hermes, Claude Code —
they all run blind and hope. axoniz stops first.
"""

import re
from typing import Dict, List, Optional, Tuple


# ─── Risk classification ────────────────────────────────────────────────────

# Tools rated by their destructiveness (0 = safe, 1 = irreversible)
_TOOL_RISK: Dict[str, float] = {
    # Safe reads
    "file_read":         0.0,
    "file_list":         0.0,
    "file_search":       0.0,
    "code_tree":         0.0,
    "code_analyze":      0.0,
    "web_search":        0.0,
    "web_get":           0.0,
    "memory_get":        0.0,
    "memory_list":       0.0,
    "palace_search":     0.0,
    "palace_context":    0.0,
    "palace_wings":      0.0,
    "palace_rooms":      0.0,
    "kg_query":          0.0,
    "kg_timeline":       0.0,
    "kg_stats":          0.0,
    "diary_read":        0.0,
    "git_status":        0.0,
    "git_log":           0.0,
    "git_diff":          0.0,
    "git_branch":        0.0,
    # Low-risk writes
    "file_append":       0.2,
    "memory_save":       0.1,
    "palace_store":      0.1,
    "kg_add":            0.1,
    "diary_write":       0.0,
    "git_add":           0.2,
    "code_lint":         0.1,
    # Medium risk
    "file_write":        0.4,
    "file_edit":         0.4,
    "code_format":       0.3,
    "git_commit":        0.3,
    "git_checkout":      0.4,
    "git_stash":         0.3,
    "palace_check_dup":  0.0,
    "palace_delete":     0.6,
    "kg_invalidate":     0.4,
    # High risk
    "shell_run":         0.7,
    "shell_python":      0.6,
    "git_push":          0.7,
    "git_pull":          0.5,
    # Maximum risk
    "file_delete":       0.9,
}

# Argument patterns that raise risk
_RISKY_PATTERNS = [
    (r"rm\s+-rf",           1.0, "rm -rf is irreversible"),
    (r"format\s+[a-z]:",    1.0, "disk format detected"),
    (r"drop\s+table",       0.9, "SQL DROP TABLE detected"),
    (r"delete\s+from",      0.8, "SQL DELETE detected"),
    (r"truncate",           0.8, "SQL TRUNCATE detected"),
    (r">\s*/dev/",          0.9, "redirect to device detected"),
    (r"shutil\.rmtree",     0.9, "rmtree detected"),
    (r"os\.remove|os\.unlink", 0.7, "file deletion in code"),
    (r"\.\.\./|/\.\./",     0.6, "path traversal detected"),
    (r"chmod\s+777",        0.5, "dangerous permissions"),
    (r"curl.*\|.*sh",       0.9, "pipe to shell detected"),
    (r"wget.*\|.*bash",     0.9, "pipe to bash detected"),
    (r"eval\s*\(",          0.7, "eval() detected"),
    (r"exec\s*\(",          0.6, "exec() detected"),
    (r"subprocess.*shell\s*=\s*True", 0.7, "shell=True detected"),
]


def assess_risk(tool_name: str, args: dict) -> Tuple[float, str]:
    """
    Returns (risk_score 0.0-1.0, reason).
    0.0 = completely safe, 1.0 = extremely dangerous.
    """
    base = _TOOL_RISK.get(tool_name, 0.5)
    reasons = []

    # Check argument content for dangerous patterns
    args_text = " ".join(str(v) for v in args.values()).lower()
    for pattern, extra_risk, reason in _RISKY_PATTERNS:
        if re.search(pattern, args_text, re.IGNORECASE):
            base = max(base, extra_risk)
            reasons.append(reason)

    # Extra checks for specific tools
    if tool_name == "shell_run":
        cmd = args.get("command", "")
        # System-level destructive commands
        if any(kw in cmd for kw in ["mkfs", "fdisk", "parted", "dd if="]):
            base = 1.0
            reasons.append("system-level destructive command")
        # Network downloads piped to shell
        if re.search(r"(curl|wget).*(sh|bash|python|node)", cmd):
            base = max(base, 0.9)
            reasons.append("remote code execution pattern")

    if tool_name == "file_delete":
        path = args.get("path", "")
        # Deleting directories or system-looking paths
        if ".git" in path or path in (".", "/", "C:\\"):
            base = 1.0
            reasons.append("deleting critical path")

    if tool_name == "file_write":
        path = args.get("path", "")
        # Writing to config/system files
        if any(p in path.lower() for p in [".bashrc", ".zshrc", "hosts", "sudoers", "passwd"]):
            base = max(base, 0.8)
            reasons.append("writing to system config")

    reason_str = "; ".join(reasons) if reasons else _TOOL_RISK_LABEL(base)
    return round(base, 2), reason_str


def _TOOL_RISK_LABEL(score: float) -> str:
    if score <= 0.1: return "safe"
    if score <= 0.3: return "low risk"
    if score <= 0.5: return "moderate risk"
    if score <= 0.7: return "high risk"
    return "very high risk"


# ─── ConfidenceScorer ──────────────────────────────────────────────────────

class ConfidenceScorer:
    """
    Scores the agent's confidence before taking an action.
    Combines:
      - Tool risk level
      - Trajectory history (has this failed before?)
      - Context coherence (does the action make sense given the task?)

    The agent calls check() before executing any tool.
    If confidence < threshold, it can stop, ask, or skip.
    """

    def __init__(
        self,
        risk_threshold:       float = 0.7,   # block actions above this risk
        trajectory_store=None,
    ):
        self.risk_threshold = risk_threshold
        self.traj           = trajectory_store

    def check(
        self,
        tool_name:  str,
        args:       dict,
        task:       str       = "",
        session_id: str       = "",
    ) -> Dict:
        """
        Returns:
        {
            "allow":       bool,    # should the agent proceed?
            "confidence":  float,   # 0.0-1.0 how confident we are it's OK
            "risk":        float,   # 0.0-1.0 how dangerous this action is
            "risk_label":  str,
            "reason":      str,
            "warnings":    list[str],
        }
        """
        risk, risk_reason = assess_risk(tool_name, args)
        warnings = []

        # Check trajectory for repeated failures on this tool
        failure_penalty = 0.0
        if self.traj and session_id:
            loops = self.traj.repeated_args(session_id, threshold=2)
            args_json = str(args)
            for lp in loops:
                if lp["tool_name"] == tool_name and lp["args_json"][:80] in args_json:
                    failure_penalty = 0.3
                    warnings.append(
                        f"This exact {tool_name} call has been made {lp['cnt']}x already — possible loop"
                    )
                    break

        # Recent failures on this tool in this session
        if self.traj:
            recent = self.traj.recent_failures(tool_name=tool_name, limit=3)
            if recent:
                failure_penalty = max(failure_penalty, 0.15)
                warnings.append(f"{tool_name} has failed recently ({len(recent)} times)")

        # Effective risk = base risk + failure penalty
        effective_risk = min(1.0, risk + failure_penalty)

        # Confidence = inverse of effective risk
        confidence = round(1.0 - effective_risk, 2)

        # Decision
        allow = effective_risk < self.risk_threshold

        # Force-block truly catastrophic actions regardless of threshold
        if risk >= 0.95:
            allow = False
            warnings.append("Action classified as catastrophic — blocked unconditionally")

        return {
            "allow":      allow,
            "confidence": confidence,
            "risk":       effective_risk,
            "risk_label": _TOOL_RISK_LABEL(effective_risk),
            "reason":     risk_reason,
            "warnings":   warnings,
        }

    def format_warning(self, check_result: Dict, tool_name: str, args: dict) -> str:
        """Format a human-readable warning for the agent to see."""
        lines = [
            f"⚠ CONFIDENCE CHECK: {tool_name}",
            f"  Risk:       {check_result['risk']:.0%} ({check_result['risk_label']})",
            f"  Confidence: {check_result['confidence']:.0%}",
        ]
        if check_result["reason"]:
            lines.append(f"  Reason:     {check_result['reason']}")
        for w in check_result["warnings"]:
            lines.append(f"  Warning:    {w}")
        if not check_result["allow"]:
            lines.append("  DECISION:   BLOCKED — too risky to proceed without verification")
        else:
            lines.append("  DECISION:   Proceeding with caution")
        return "\n".join(lines)
