"""
AXONIZ-ZERO Debug / Logging Compatibility Layer
Delegates to the new comprehensive logger (axoniz.core.logger).
All new code should import from axoniz.core.logger directly.
This file exists for backward compatibility.
"""

from axoniz.core.logger import (
    debug,
    info,
    warn,
    error,
    critical,
    log_json,
    set_level,
    robust_handle,
    get_logger,
    init_logger,
    LogConfig,
)

__all__ = [
    "debug", "info", "warn", "error", "critical",
    "log_json", "set_level", "robust_handle",
    "get_logger", "init_logger", "LogConfig",
]
