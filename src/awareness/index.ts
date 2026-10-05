/**
 * src/awareness/index.ts
 * ========================
 * AXONIZ awareness subsystem — proactive environment monitoring.
 *
 * Port of axoniz/awareness/__init__.py. The Python `__all__` is preserved
 * exactly; camelCase aliases and the screen/OCR helpers are also exported
 * because the Node port has to expose the degraded capabilities explicitly.
 */

export {
  AwarenessService,
  ContextSnapshot,
  SuggestionEngine,
  get_awareness_service,
  get_system_metrics,
  get_active_window_title,
  get_clipboard,
} from "./service.js";

export {
  getAwarenessService,
  getSystemMetricsAsync,
  getActiveWindowTitle,
  getClipboard,
  take_screenshot_ocr,
  takeScreenshotOcr,
  captureScreen,
  ocrImage,
  cropAndPreprocess,
  findTextOnScreen,
  find_text_on_screen,
  findTesseract,
  OCR_UNAVAILABLE_ERROR,
  SCREENSHOT_UNAVAILABLE_ERROR,
  type SystemMetrics,
  type ScreenRegion,
  type TextFound,
  type AwarenessStatus,
} from "./service.js";

/** Python `__init__.py` `__all__` equivalent. */
export const __all__ = [
  "AwarenessService",
  "ContextSnapshot",
  "SuggestionEngine",
  "get_awareness_service",
  "get_system_metrics",
  "get_active_window_title",
  "get_clipboard",
] as const;
