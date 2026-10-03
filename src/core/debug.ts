/**
 * AXONIZ-ZERO Debug / Logging Compatibility Layer
 * Delegates to the comprehensive logger (src/core/logger.ts).
 * All new code should import from src/core/logger.ts directly.
 * This module exists for backward compatibility with the Python layout.
 */
export {
  debug,
  info,
  warn,
  error,
  critical,
  logJson as log_json,
  setLevel as set_level,
  robustHandle as robust_handle,
  getLogger,
  getLogger as get_logger,
  initLogger,
  initLogger as init_logger,
  LogConfig,
  AxonizLogger,
  safeJson,
} from "./logger.js";
