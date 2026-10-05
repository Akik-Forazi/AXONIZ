"""
axoniz/integrations/mempalace.py
=================================
Legacy shim — MemPalaceBridge and MemPalaceMemory are now part of
axoniz.integrations.unified_memory.UnifiedMemory.

This file re-exports them so any existing code that imports from here
still works without changes.
"""

from axoniz.integrations.unified_memory import (
    PalaceLayer as MemPalaceBridge,
    UnifiedMemory as MemPalaceMemory,
)

# Backwards-compat: get_bridge() returned a MemPalaceBridge singleton
_bridge = None

def get_bridge(base_url: str = None) -> MemPalaceBridge:
    global _bridge
    if _bridge is None:
        _bridge = MemPalaceBridge()
    return _bridge
