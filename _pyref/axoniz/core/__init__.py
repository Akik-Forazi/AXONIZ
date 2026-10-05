"""Core module for AXONIZ-ZERO."""

from axoniz.core.logger import (
    get_logger,
    init_logger,
    LogConfig,
    debug,
    info,
    warn,
    error,
    critical,
    log_json,
    set_level,
    robust_handle,
    log_calls,
)

from axoniz.core.errors import (
    axonizError,
    BackendError,
    BackendNotAvailableError,
    ModelNotFoundError,
    ApiKeyMissingError,
    BackendTimeoutError,
    RateLimitError,
    ToolError,
    ToolTimeoutError,
    ToolSecurityError,
    WorkspaceViolationError,
    FileTooLargeError,
    AgentError,
    AgentLoopError,
    AgentMaxStepsError,
    ConfigError,
    NetworkError,
)

__all__ = [
    # Logger
    "get_logger", "init_logger", "LogConfig",
    "debug", "info", "warn", "error", "critical",
    "log_json", "set_level", "robust_handle", "log_calls",
    # Errors
    "axonizError", "BackendError", "BackendNotAvailableError",
    "ModelNotFoundError", "ApiKeyMissingError", "BackendTimeoutError",
    "RateLimitError", "ToolError", "ToolTimeoutError",
    "ToolSecurityError", "WorkspaceViolationError", "FileTooLargeError",
    "AgentError", "AgentLoopError", "AgentMaxStepsError",
    "ConfigError", "NetworkError",
]
