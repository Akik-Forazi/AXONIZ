/**
 * axoniz.core.intelligence.self_correction
 * ==========================================
 * Live Self-Correction Engine — Phase 1 of the AXONIZ dominance plan.
 *
 * After each tool result, the agent analyzes whether:
 *   1. The result indicates an error
 *   2. The action actually achieved its goal
 *   3. The result is suspicious or unexpected
 *
 * If something went wrong, it:
 *   - Detects the error type
 *   - Generates a corrective action
 *   - Signals the agent to replan instead of blindly continuing
 *
 * Port notes (Python → Node):
 *   - `enum.Enum` → TypeScript string enums with identical `.value`s, so
 *     `ErrorType.LOOP_DETECTED === "loop_detected"` just like Python's
 *     `class ErrorType(str, Enum)` mixin.
 *   - Python's `Tuple[ErrorType, str]` returns are arrays that additionally
 *     expose `error_type` / `explanation` properties, so both tuple unpacking
 *     (`const [t, e] = classify_error(...)`) and attribute access work.
 */

/* ── API Error types (from Hermes) ────────────────────────────────────────────── */

export enum APIFailoverReason {
  AUTH = "auth",
  BILLING = "billing",
  RATE_LIMIT = "rate_limit",
  OVERLOADED = "overloaded",
  SERVER_ERROR = "server_error",
  TIMEOUT = "timeout",
  CONTEXT_OVERFLOW = "context_overflow",
  MODEL_NOT_FOUND = "model_not_found",
  FORMAT_ERROR = "format_error",
  UNKNOWN = "unknown",
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return String(error);
}

/** Classify an API error to determine recovery strategy. */
export function classify_api_error(error: unknown): APIFailoverReason {
  const msg = errorMessage(error).toLowerCase();

  if (["context length", "context size", "token limit", "too many tokens"].some((p) => msg.includes(p))) {
    return APIFailoverReason.CONTEXT_OVERFLOW;
  }
  if (["rate limit", "too many requests", "throttled"].some((p) => msg.includes(p))) {
    return APIFailoverReason.RATE_LIMIT;
  }
  if (["insufficient credits", "billing", "quota exceeded"].some((p) => msg.includes(p))) {
    return APIFailoverReason.BILLING;
  }
  if (["invalid api key", "unauthorized", "authentication"].some((p) => msg.includes(p))) {
    return APIFailoverReason.AUTH;
  }
  if (["timeout", "connection refused", "deadline exceeded"].some((p) => msg.includes(p))) {
    return APIFailoverReason.TIMEOUT;
  }
  if (["500", "502", "503", "504", "internal server error", "overloaded"].some((p) => msg.includes(p))) {
    return APIFailoverReason.OVERLOADED;
  }

  return APIFailoverReason.UNKNOWN;
}

export const classifyApiError = classify_api_error;

/* ── Error types ────────────────────────────────────────────────────────────── */

export enum ErrorType {
  NONE = "none",
  FILE_NOT_FOUND = "file_not_found",
  PERMISSION = "permission_denied",
  SYNTAX = "syntax_error",
  IMPORT = "import_error",
  RUNTIME = "runtime_error",
  NETWORK = "network_error",
  TOOL_UNKNOWN = "tool_unknown",
  LOOP_DETECTED = "loop_detected",
  TIMEOUT = "timeout",
  EMPTY_RESULT = "empty_result",
  UNEXPECTED = "unexpected",
}

/* ─── Error patterns ──────────────────────────────────────────────────────────── */

const _ERROR_PATTERNS: Array<[RegExp, ErrorType, string]> = [
  // File errors
  [/no such file or directory/, ErrorType.FILE_NOT_FOUND, "The file path does not exist"],
  [/filenotfounderror/, ErrorType.FILE_NOT_FOUND, "File not found"],
  [/path does not exist/, ErrorType.FILE_NOT_FOUND, "Path does not exist"],
  // Permissions
  [/permission denied/, ErrorType.PERMISSION, "Insufficient permissions"],
  [/access is denied/, ErrorType.PERMISSION, "Access denied (Windows)"],
  // Syntax
  [/syntaxerror/, ErrorType.SYNTAX, "Python syntax error in code"],
  [/invalid syntax/, ErrorType.SYNTAX, "Invalid Python syntax"],
  [/unexpected token/, ErrorType.SYNTAX, "Unexpected token"],
  // Imports
  [/modulenotfounderror/, ErrorType.IMPORT, "Python module not installed"],
  [/importerror/, ErrorType.IMPORT, "Import failed"],
  [/no module named/, ErrorType.IMPORT, "Module not found — needs pip install"],
  // Runtime
  [/traceback \(most recent/, ErrorType.RUNTIME, "Python exception occurred"],
  [/typeerror/, ErrorType.RUNTIME, "Type error in code"],
  [/nameerror/, ErrorType.RUNTIME, "Name not defined"],
  [/attributeerror/, ErrorType.RUNTIME, "Attribute does not exist"],
  [/valueerror/, ErrorType.RUNTIME, "Invalid value"],
  [/indexerror/, ErrorType.RUNTIME, "Index out of range"],
  [/keyerror/, ErrorType.RUNTIME, "Key not found"],
  // Network
  [/connection refused/, ErrorType.NETWORK, "Server is not running or wrong port"],
  [/timeout/, ErrorType.TIMEOUT, "Operation timed out"],
  [/urlopen error/, ErrorType.NETWORK, "Network request failed"],
  [/name or service not known/, ErrorType.NETWORK, "DNS resolution failed"],
  // Tool errors
  [/\[error\]/, ErrorType.UNEXPECTED, "Tool reported an error"],
  [/unknown tool/, ErrorType.TOOL_UNKNOWN, "Tool name not recognized"],
  [/bad args/, ErrorType.UNEXPECTED, "Wrong arguments provided"],
  // Loop detection
  [/loop on '/, ErrorType.LOOP_DETECTED, "Agent is stuck in a loop"],
  [/reached maximum steps/, ErrorType.LOOP_DETECTED, "Max steps exceeded"],
];

/** `(ErrorType, explanation)` — an array that also carries both fields by name. */
export type ErrorClassification = [ErrorType, string] & {
  error_type: ErrorType;
  explanation: string;
};

/**
 * Classify what kind of error (if any) is in a tool result.
 * Returns (ErrorType, explanation).
 */
export function classify_error(result: string): ErrorClassification {
  if (!result) {
    return _classification(ErrorType.EMPTY_RESULT, "Tool returned no output");
  }

  const lower = result.toLowerCase();

  // Quick success check — if result looks normal, skip pattern matching
  if (
    result.length > 10 &&
    !["error", "failed", "exception", "denied", "not found", "traceback"].some((kw) =>
      lower.includes(kw),
    )
  ) {
    return _classification(ErrorType.NONE, "");
  }

  for (const [pattern, err_type, explanation] of _ERROR_PATTERNS) {
    if (pattern.test(lower)) {
      return _classification(err_type, explanation);
    }
  }

  return _classification(ErrorType.NONE, "");
}

function _classification(error_type: ErrorType, explanation: string): ErrorClassification {
  const tuple: [ErrorType, string] = [error_type, explanation];
  return Object.assign(tuple, { error_type, explanation });
}

export const classifyError = classify_error;

/* ─── Corrective actions ──────────────────────────────────────────────────────── */

const _CORRECTIONS: Partial<Record<ErrorType, string[]>> = {
  [ErrorType.FILE_NOT_FOUND]: [
    "Use file_list to check what actually exists in that directory",
    "Check if the path uses the correct directory separator for this OS",
    "Verify the workspace root with file_list(path='.')",
  ],
  [ErrorType.PERMISSION]: [
    "Check if the file is locked by another process with shell_run('tasklist')",
    "Try running the operation with a different path",
    "Check file permissions with shell_run('icacls <path>')",
  ],
  [ErrorType.SYNTAX]: [
    "Re-read the file to check for the syntax error location",
    "Use code_lint to identify the exact line with the syntax error",
    "Fix the syntax error before retrying",
  ],
  [ErrorType.IMPORT]: [
    "Install the missing module with shell_run('pip install <module>')",
    "Check if the virtual environment is activated",
    "Verify the module name is correct",
  ],
  [ErrorType.RUNTIME]: [
    "Read the full traceback to identify the exact failure point",
    "Check the input values being passed to the failing function",
    "Add error handling around the problematic code",
  ],
  [ErrorType.NETWORK]: [
    "Check if the target server is running with shell_run",
    "Verify the URL/port is correct",
    "Try again after a short wait",
  ],
  [ErrorType.TIMEOUT]: [
    "Increase timeout or use a simpler/faster alternative",
    "Check if the process is hung",
  ],
  [ErrorType.LOOP_DETECTED]: [
    "Stop and reassess the approach — current strategy is not working",
    "Try a completely different tool or method for this step",
    "Report the loop to the user and ask for guidance",
  ],
  [ErrorType.EMPTY_RESULT]: [
    "Verify the target exists before running the operation",
    "Check if the tool ran on the wrong path",
  ],
  [ErrorType.UNEXPECTED]: [
    "Read the error message carefully and address the specific issue",
    "Use a different approach to accomplish the same goal",
  ],
};

/* ─── SelfCorrector ──────────────────────────────────────────────────────────── */

export interface ErrorHistoryEntry {
  step: number;
  tool: string;
  error_type: ErrorType;
  explanation: string;
}

/** Shape of what `SelfCorrector.analyze()` returns (Python dict keys preserved). */
export interface CorrectionAnalysis {
  error_type: ErrorType;
  has_error: boolean;
  explanation: string;
  corrections: string[];
  should_replan: boolean;
  severity: string;
}

/**
 * Analyzes tool results in real-time and generates corrective guidance
 * when something goes wrong.
 *
 * The agent calls analyze() after every tool execution. If an error is
 * detected, it receives a correction dict telling it what to do next.
 */
export class SelfCorrector {
  _corrections_made = 0;
  _max: number;
  _error_history: ErrorHistoryEntry[] = [];

  constructor(max_corrections_per_session = 10) {
    this._max = max_corrections_per_session;
  }

  get correctionsMade(): number {
    return this._corrections_made;
  }

  get errorHistory(): ErrorHistoryEntry[] {
    return this._error_history;
  }

  /**
   * Analyze a tool result.
   * Returns:
   * {
   *     "error_type":    ErrorType,
   *     "has_error":     bool,
   *     "explanation":   str,
   *     "corrections":   list[str],    # what to do next
   *     "should_replan": bool,         # should the agent change strategy?
   *     "severity":      str,          # "low" / "medium" / "high" / "critical"
   * }
   */
  analyze(
    tool_name: string,
    args: Record<string, unknown>,
    result: string,
    step_num = 0,
  ): CorrectionAnalysis {
    void args; // Python accepted `args` and never used it.
    const classification = classify_error(result);
    const error_type = classification.error_type;
    const explanation = classification.explanation;
    const has_error = error_type !== ErrorType.NONE;

    const corrections = (_CORRECTIONS[error_type] ?? []).slice(0, 3);

    // Determine severity
    let severity = "low";
    if (error_type === ErrorType.LOOP_DETECTED) {
      severity = "critical";
    } else if (
      error_type === ErrorType.PERMISSION ||
      error_type === ErrorType.IMPORT ||
      error_type === ErrorType.SYNTAX
    ) {
      severity = "high";
    } else if (error_type === ErrorType.RUNTIME || error_type === ErrorType.NETWORK) {
      severity = "medium";
    }

    // Should we replan?
    const should_replan =
      error_type === ErrorType.LOOP_DETECTED ||
      error_type === ErrorType.PERMISSION ||
      this._corrections_made >= this._max;

    if (has_error) {
      this._corrections_made += 1;
      this._error_history.push({
        step: step_num,
        tool: tool_name,
        error_type,
        explanation,
      });
    }

    return {
      error_type,
      has_error,
      explanation,
      corrections,
      should_replan,
      severity,
    };
  }

  /** camelCase alias. */
  analyzeResult(
    tool_name: string,
    args: Record<string, unknown>,
    result: string,
    step_num = 0,
  ): CorrectionAnalysis {
    return this.analyze(tool_name, args, result, step_num);
  }

  /**
   * Build a message the agent injects into the conversation
   * to guide its next action.
   */
  build_correction_message(analysis: CorrectionAnalysis, tool_name: string): string {
    if (!analysis.has_error) {
      return "";
    }

    const lines = [
      `[SELF-CORRECTION] Error detected after ${tool_name}:`,
      `  Type:     ${analysis.error_type}`,
      `  Problem:  ${analysis.explanation}`,
      `  Severity: ${analysis.severity}`,
    ];
    if (analysis.corrections.length > 0) {
      lines.push("  Suggested fixes:");
      for (const c of analysis.corrections) {
        lines.push(`    → ${c}`);
      }
    }
    if (analysis.should_replan) {
      lines.push("  IMPORTANT: Current approach is not working. Replan before continuing.");
    }
    lines.push("Address this issue before proceeding with the next step.");
    return lines.join("\n");
  }

  /** camelCase alias. */
  buildCorrectionMessage(analysis: CorrectionAnalysis, tool_name: string): string {
    return this.build_correction_message(analysis, tool_name);
  }

  /** Summary of all errors corrected in this session. */
  session_summary(): string {
    if (this._error_history.length === 0) {
      return "No errors encountered this session.";
    }
    const lines = [`Errors corrected: ${this._error_history.length}`];
    for (const e of this._error_history.slice(-5)) {
      lines.push(`  step ${e.step}: ${e.tool} → ${e.error_type} — ${e.explanation}`);
    }
    return lines.join("\n");
  }

  /** camelCase alias. */
  sessionSummary(): string {
    return this.session_summary();
  }

  reset(): void {
    this._corrections_made = 0;
    this._error_history = [];
  }
}
