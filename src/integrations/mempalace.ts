/**
 * axoniz/integrations/mempalace.ts
 * =================================
 * Legacy shim — MemPalaceBridge and MemPalaceMemory are now part of
 * axoniz.integrations.unified_memory.UnifiedMemory.
 *
 * Port of axoniz/integrations/mempalace.py
 *
 * Kept so existing code that imports MemPalaceBridge / MemPalaceMemory /
 * get_bridge() keeps working. `MemPalaceBridge` IS `PalaceLayer` and
 * `MemPalaceMemory` IS `UnifiedMemory`, exactly as in Python.
 */
import { PalaceLayer, UnifiedMemory } from "./unified_memory.js";

export { PalaceLayer as MemPalaceBridge, UnifiedMemory as MemPalaceMemory };
export { PalaceLayer, UnifiedMemory };

/** Backwards-compat singleton (Python's `get_bridge()` ignored its argument). */
let _bridge: PalaceLayer | null = null;

export function get_bridge(_baseUrl?: string | null): PalaceLayer {
  if (_bridge === null) {
    _bridge = new PalaceLayer();
  }
  return _bridge;
}

export const getBridge = get_bridge;
