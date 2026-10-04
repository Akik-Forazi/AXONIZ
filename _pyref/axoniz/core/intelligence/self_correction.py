"""
axoniz.core.intelligence.self_correction
==========================================
Live Self-Correction Engine — Phase 1 of the AXONIZ dominance plan.

After each tool result, the agent analyzes whether:
  1. The result indicates an error
  2. The action actually achieved its goal
  3. The result is suspicious or unexpected

If something went wrong, it:
  - Detects the error type
  - Generates a corrective action
  - Signals the agent to replan instead of blindly continuing

This is what separates axoniz from every other local agent.
Claude Code, Hermes, OpenClaw — they all continue blindly after errors.
axoniz stops, diagnoses, and corrects.
"""

import re
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any


# ── API Error types (from Hermes) ──────────────────────────────────────────────

class APIFailoverReason(Enum):
    AUTH            = "auth"
    BILLING         = "billing"
    RATE_LIMIT      = "rate_limit"
    OVERLOADED      = "overloaded"
    SERVER_ERROR    = "server_error"
    TIMEOUT         = "timeout"
    CONTEXT_OVERFLOW = "context_overflow"
    MODEL_NOT_FOUND = "model_not_found"
    FORMAT_ERROR    = "format_error"
    UNKNOWN         = "unknown"

def classify_api_error(error: Exception) -> APIFailoverReason:
    """Classify an API error to determine recovery strategy."""
    msg = str(error).lower()

    if any(p in msg for p in ["context length", "context size", "token limit", "too many tokens"]):
        return APIFailoverReason.CONTEXT_OVERFLOW
    if any(p in msg for p in ["rate limit", "too many requests", "throttled"]):
        return APIFailoverReason.RATE_LIMIT
    if any(p in msg for p in ["insufficient credits", "billing", "quota exceeded"]):
        return APIFailoverReason.BILLING
    if any(p in msg for p in ["invalid api key", "unauthorized", "authentication"]):
        return APIFailoverReason.AUTH
    if any(p in msg for p in ["timeout", "connection refused", "deadline exceeded"]):
        return APIFailoverReason.TIMEOUT
    if any(p in msg for p in ["500", "502", "503", "504", "internal server error", "overloaded"]):
        return APIFailoverReason.OVERLOADED

    return APIFailoverReason.UNKNOWN


# ── Error types ──────────────────────────────────────────────────────────────


class ErrorType(str, Enum):
    NONE            = "none"
    FILE_NOT_FOUND  = "file_not_found"
    PERMISSION      = "permission_denied"
    SYNTAX          = "syntax_error"
    IMPORT          = "import_error"
    RUNTIME         = "runtime_error"
    NETWORK         = "network_error"
    TOOL_UNKNOWN    = "tool_unknown"
    LOOP_DETECTED   = "loop_detected"
    TIMEOUT         = "timeout"
    EMPTY_RESULT    = "empty_result"
    UNEXPECTED      = "unexpected"


# ─── Error patterns ────────────────────────────────────────────────────────────

_ERROR_PATTERNS: List[Tuple[str, ErrorType, str]] = [
    # File errors
    (r"no such file or directory", ErrorType.FILE_NOT_FOUND, "The file path does not exist"),
    (r"filenotfounderror",          ErrorType.FILE_NOT_FOUND, "File not found"),
    (r"path does not exist",        ErrorType.FILE_NOT_FOUND, "Path does not exist"),
    # Permissions
    (r"permission denied",          ErrorType.PERMISSION, "Insufficient permissions"),
    (r"access is denied",           ErrorType.PERMISSION, "Access denied (Windows)"),
    # Syntax
    (r"syntaxerror",                ErrorType.SYNTAX, "Python syntax error in code"),
    (r"invalid syntax",             ErrorType.SYNTAX, "Invalid Python syntax"),
    (r"unexpected token",           ErrorType.SYNTAX, "Unexpected token"),
    # Imports
    (r"modulenotfounderror",        ErrorType.IMPORT, "Python module not installed"),
    (r"importerror",                ErrorType.IMPORT, "Import failed"),
    (r"no module named",            ErrorType.IMPORT, "Module not found — needs pip install"),
    # Runtime
    (r"traceback \(most recent",    ErrorType.RUNTIME, "Python exception occurred"),
    (r"typeerror",                  ErrorType.RUNTIME, "Type error in code"),
    (r"nameerror",                  ErrorType.RUNTIME, "Name not defined"),
    (r"attributeerror",             ErrorType.RUNTIME, "Attribute does not exist"),
    (r"valueerror",                 ErrorType.RUNTIME, "Invalid value"),
    (r"indexerror",                 ErrorType.RUNTIME, "Index out of range"),
    (r"keyerror",                   ErrorType.RUNTIME, "Key not found"),
    # Network
    (r"connection refused",         ErrorType.NETWORK, "Server is not running or wrong port"),
    (r"timeout",                    ErrorType.TIMEOUT,  "Operation timed out"),
    (r"urlopen error",              ErrorType.NETWORK, "Network request failed"),
    (r"name or service not known",  ErrorType.NETWORK, "DNS resolution failed"),
    # Tool errors
    (r"\[error\]",                  ErrorType.UNEXPECTED, "Tool reported an error"),
    (r"unknown tool",               ErrorType.TOOL_UNKNOWN, "Tool name not recognized"),
    (r"bad args",                   ErrorType.UNEXPECTED, "Wrong arguments provided"),
    # Loop detection
    (r"loop on '",                  ErrorType.LOOP_DETECTED, "Agent is stuck in a loop"),
    (r"reached maximum steps",      ErrorType.LOOP_DETECTED, "Max steps exceeded"),
]


def classify_error(result: str) -> Tuple[ErrorType, str]:
    """
    Classify what kind of error (if any) is in a tool result.
    Returns (ErrorType, explanation).
    """
    if not result:
        return ErrorType.EMPTY_RESULT, "Tool returned no output"

    lower = result.lower()

    # Quick success check — if result looks normal, skip pattern matching
    if len(result) > 10 and not any(
        kw in lower for kw in ["error", "failed", "exception", "denied", "not found", "traceback"]
    ):
        return ErrorType.NONE, ""

    for pattern, err_type, explanation in _ERROR_PATTERNS:
        if re.search(pattern, lower):
            return err_type, explanation

    return ErrorType.NONE, ""


# ─── Corrective actions ────────────────────────────────────────────────────────

_CORRECTIONS: Dict[ErrorType, List[str]] = {
    ErrorType.FILE_NOT_FOUND: [
        "Use file_list to check what actually exists in that directory",
        "Check if the path uses the correct directory separator for this OS",
        "Verify the workspace root with file_list(path='.')",
    ],
    ErrorType.PERMISSION: [
        "Check if the file is locked by another process with shell_run('tasklist')",
        "Try running the operation with a different path",
        "Check file permissions with shell_run('icacls <path>')",
    ],
    ErrorType.SYNTAX: [
        "Re-read the file to check for the syntax error location",
        "Use code_lint to identify the exact line with the syntax error",
        "Fix the syntax error before retrying",
    ],
    ErrorType.IMPORT: [
        "Install the missing module with shell_run('pip install <module>')",
        "Check if the virtual environment is activated",
        "Verify the module name is correct",
    ],
    ErrorType.RUNTIME: [
        "Read the full traceback to identify the exact failure point",
        "Check the input values being passed to the failing function",
        "Add error handling around the problematic code",
    ],
    ErrorType.NETWORK: [
        "Check if the target server is running with shell_run",
        "Verify the URL/port is correct",
        "Try again after a short wait",
    ],
    ErrorType.TIMEOUT: [
        "Increase timeout or use a simpler/faster alternative",
        "Check if the process is hung",
    ],
    ErrorType.LOOP_DETECTED: [
        "Stop and reassess the approach — current strategy is not working",
        "Try a completely different tool or method for this step",
        "Report the loop to the user and ask for guidance",
    ],
    ErrorType.EMPTY_RESULT: [
        "Verify the target exists before running the operation",
        "Check if the tool ran on the wrong path",
    ],
    ErrorType.UNEXPECTED: [
        "Read the error message carefully and address the specific issue",
        "Use a different approach to accomplish the same goal",
    ],
}


# ─── SelfCorrector ────────────────────────────────────────────────────────────

class SelfCorrector:
    """
    Analyzes tool results in real-time and generates corrective guidance
    when something goes wrong.

    The agent calls analyze() after every tool execution. If an error is
    detected, it receives a correction dict telling it what to do next.
    """

    def __init__(self, max_corrections_per_session: int = 10):
        self._corrections_made = 0
        self._max              = max_corrections_per_session
        self._error_history: List[Dict] = []

    def analyze(
        self,
        tool_name: str,
        args:      dict,
        result:    str,
        step_num:  int = 0,
    ) -> Dict:
        """
        Analyze a tool result.
        Returns:
        {
            "error_type":    ErrorType,
            "has_error":     bool,
            "explanation":   str,
            "corrections":   list[str],    # what to do next
            "should_replan": bool,         # should the agent change strategy?
            "severity":      str,          # "low" / "medium" / "high" / "critical"
        }
        """
        error_type, explanation = classify_error(result)
        has_error = error_type != ErrorType.NONE

        corrections = _CORRECTIONS.get(error_type, [])[:3]

        # Determine severity
        severity = "low"
        if error_type in (ErrorType.LOOP_DETECTED,):
            severity = "critical"
        elif error_type in (ErrorType.PERMISSION, ErrorType.IMPORT, ErrorType.SYNTAX):
            severity = "high"
        elif error_type in (ErrorType.RUNTIME, ErrorType.NETWORK):
            severity = "medium"

        # Should we replan?
        should_replan = (
            error_type in (ErrorType.LOOP_DETECTED, ErrorType.PERMISSION)
            or self._corrections_made >= self._max
        )

        if has_error:
            self._corrections_made += 1
            self._error_history.append({
                "step":        step_num,
                "tool":        tool_name,
                "error_type":  error_type,
                "explanation": explanation,
            })

        return {
            "error_type":    error_type,
            "has_error":     has_error,
            "explanation":   explanation,
            "corrections":   corrections,
            "should_replan": should_replan,
            "severity":      severity,
        }

    def build_correction_message(self, analysis: Dict, tool_name: str) -> str:
        """
        Build a message the agent injects into the conversation
        to guide its next action.
        """
        if not analysis["has_error"]:
            return ""

        lines = [
            f"[SELF-CORRECTION] Error detected after {tool_name}:",
            f"  Type:     {analysis['error_type']}",
            f"  Problem:  {analysis['explanation']}",
            f"  Severity: {analysis['severity']}",
        ]
        if analysis["corrections"]:
            lines.append("  Suggested fixes:")
            for c in analysis["corrections"]:
                lines.append(f"    → {c}")
        if analysis["should_replan"]:
            lines.append("  IMPORTANT: Current approach is not working. Replan before continuing.")
        lines.append("Address this issue before proceeding with the next step.")
        return "\n".join(lines)

    def session_summary(self) -> str:
        """Summary of all errors corrected in this session."""
        if not self._error_history:
            return "No errors encountered this session."
        lines = [f"Errors corrected: {len(self._error_history)}"]
        for e in self._error_history[-5:]:
            lines.append(f"  step {e['step']}: {e['tool']} → {e['error_type']} — {e['explanation']}")
        return "\n".join(lines)

    def reset(self):
        self._corrections_made = 0
        self._error_history    = []
