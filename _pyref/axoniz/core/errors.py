"""
AXONIZ-ZERO Error Hierarchy
Production-grade typed exceptions for clear error handling throughout the system.
"""


class axonizError(Exception):
    """Base class for all AXONIZ-ZERO errors."""
    def __init__(self, message: str, code: str = "AXONIZ_ERROR", details: dict = None):
        super().__init__(message)
        self.code    = code
        self.details = details or {}

    def to_dict(self) -> dict:
        return {"error": self.code, "message": str(self), "details": self.details}


# ── Backend errors ─────────────────────────────────────────────────────────────

class BackendError(axonizError):
    """Raised when an LLM backend fails."""
    def __init__(self, message: str, backend: str = "", details: dict = None):
        super().__init__(message, "BACKEND_ERROR", details)
        self.backend = backend


class BackendNotAvailableError(BackendError):
    """Backend server is not reachable."""
    def __init__(self, backend: str, url: str = ""):
        super().__init__(
            f"Backend '{backend}' is not available" + (f" at {url}" if url else ""),
            backend=backend, details={"url": url}
        )
        self.code = "BACKEND_NOT_AVAILABLE"


class ModelNotFoundError(BackendError):
    """Requested model does not exist on the backend."""
    def __init__(self, model: str, backend: str = ""):
        super().__init__(f"Model '{model}' not found", backend=backend, details={"model": model})
        self.code = "MODEL_NOT_FOUND"


class ApiKeyMissingError(BackendError):
    """API key is required but not configured."""
    def __init__(self, backend: str):
        super().__init__(f"API key not set for '{backend}'", backend=backend)
        self.code = "API_KEY_MISSING"


class BackendTimeoutError(BackendError):
    """Backend did not respond within the allowed time."""
    def __init__(self, backend: str, timeout: float):
        super().__init__(
            f"Backend '{backend}' timed out after {timeout:.1f}s",
            backend=backend, details={"timeout": timeout}
        )
        self.code = "BACKEND_TIMEOUT"


class RateLimitError(BackendError):
    """API rate limit was hit."""
    def __init__(self, backend: str, retry_after: float = 0):
        super().__init__(
            f"Rate limit hit on '{backend}'" + (f", retry after {retry_after}s" if retry_after else ""),
            backend=backend, details={"retry_after": retry_after}
        )
        self.code = "RATE_LIMIT"


# ── Tool errors ────────────────────────────────────────────────────────────────

class ToolError(axonizError):
    """Raised when a tool execution fails."""
    def __init__(self, message: str, tool: str = "", details: dict = None):
        super().__init__(message, "TOOL_ERROR", details)
        self.tool = tool


class ToolTimeoutError(ToolError):
    """Tool exceeded its time budget."""
    def __init__(self, tool: str, timeout: float):
        super().__init__(
            f"Tool '{tool}' timed out after {timeout:.1f}s",
            tool=tool, details={"timeout": timeout}
        )
        self.code = "TOOL_TIMEOUT"


class ToolSecurityError(ToolError):
    """Tool attempted a disallowed operation."""
    def __init__(self, tool: str, reason: str):
        super().__init__(f"Security violation in '{tool}': {reason}", tool=tool, details={"reason": reason})
        self.code = "TOOL_SECURITY"


class WorkspaceViolationError(ToolError):
    """File operation attempted outside the allowed workspace."""
    def __init__(self, path: str, workspace: str):
        super().__init__(
            f"Path '{path}' is outside the workspace '{workspace}'",
            tool="file", details={"path": path, "workspace": workspace}
        )
        self.code = "WORKSPACE_VIOLATION"


class FileTooLargeError(ToolError):
    """File size exceeds the allowed limit."""
    def __init__(self, path: str, size: int, limit: int):
        super().__init__(
            f"File '{path}' is {size:,} bytes, limit is {limit:,} bytes",
            tool="file", details={"path": path, "size": size, "limit": limit}
        )
        self.code = "FILE_TOO_LARGE"


# ── Agent errors ───────────────────────────────────────────────────────────────

class AgentError(axonizError):
    """Raised by the agent loop."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, "AGENT_ERROR", details)


class AgentLoopError(AgentError):
    """Agent detected an infinite loop."""
    def __init__(self, tool: str, count: int):
        super().__init__(
            f"Infinite loop: '{tool}' called {count} times with identical args",
            details={"tool": tool, "count": count}
        )
        self.code = "AGENT_LOOP"


class AgentMaxStepsError(AgentError):
    """Agent exhausted its step budget."""
    def __init__(self, steps: int):
        super().__init__(f"Exhausted maximum {steps} steps", details={"steps": steps})
        self.code = "AGENT_MAX_STEPS"


# ── Config errors ──────────────────────────────────────────────────────────────

class ConfigError(axonizError):
    """Configuration is invalid or missing."""
    def __init__(self, message: str, key: str = ""):
        super().__init__(message, "CONFIG_ERROR", {"key": key})


# ── Network errors ─────────────────────────────────────────────────────────────

class NetworkError(axonizError):
    """Generic network failure."""
    def __init__(self, message: str, url: str = ""):
        super().__init__(message, "NETWORK_ERROR", {"url": url})
