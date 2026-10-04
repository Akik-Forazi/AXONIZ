"""
axoniz/awareness/__init__.py
"""
from axoniz.awareness.service import (
    AwarenessService, ContextSnapshot, SuggestionEngine,
    get_awareness_service, get_system_metrics,
    get_active_window_title, get_clipboard,
)

__all__ = [
    "AwarenessService", "ContextSnapshot", "SuggestionEngine",
    "get_awareness_service", "get_system_metrics",
    "get_active_window_title", "get_clipboard",
]
