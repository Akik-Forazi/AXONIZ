"""
Axodex Native Tools — Graph-powered code intelligence
Connects AXONIZ directly to the Axodex graph index.
"""

import os
import json
import subprocess
import sys
from typing import Any, Dict, Optional
from axoniz.core.debug import debug, warn, error

# Path to the Axodex CLI entry point
_local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "integrations", "Axodex", "axodex"))
_global_path = os.path.expanduser("~/.axoniz/integrations/Axodex/axodex")

# Path Sovereignty: Prioritize global installation if it exists and is complete
def _is_valid_engine(path):
    return (os.path.exists(os.path.join(path, "dist", "cli", "index.js")) and 
            os.path.exists(os.path.join(path, "node_modules")))

if _is_valid_engine(_global_path):
    AXODEX_ROOT = _global_path
elif _is_valid_engine(_local_path):
    AXODEX_ROOT = _local_path
elif getattr(sys, 'frozen', False):
    AXODEX_ROOT = os.path.join(sys._MEIPASS, "axoniz", "integrations", "Axodex", "axodex")
else:
    AXODEX_ROOT = _local_path

AXODEX_CLI = os.path.join(AXODEX_ROOT, "dist", "cli", "index.js")

class AxodexTools:
    """
    Python wrapper for Axodex CLI tools.
    Provides deep codebase awareness via graph analysis.
    """
    def __init__(self, workspace: str = "."):
        self.workspace = os.path.abspath(workspace)
        self._ensure_built()

    def _ensure_built(self):
        """Check if Axodex CLI exists."""
        if not os.path.exists(AXODEX_CLI):
            # Try running npx axodex --help to see if it's available globally
            try:
                subprocess.run(["npx.cmd", "axodex", "--help"], capture_output=True, check=True, encoding="utf-8", errors="replace")
                return
            except Exception:
                error(f"[Axodex] CLI not found at {AXODEX_CLI} and npx axodex is not available. Please ensure Axodex is installed.")

    def _run(self, cmd: list) -> str:
        """Execute axodex command and return stdout."""
        if os.path.exists(AXODEX_CLI):
            node_bin = "node"
            full_cmd = [node_bin, AXODEX_CLI] + cmd
        else:
            full_cmd = ["npx.cmd", "axodex"] + cmd
        try:
            result = subprocess.run(
                full_cmd,
                capture_output=True,
                text=True,
                cwd=self.workspace,
                timeout=120,
                encoding="utf-8",
                errors="replace"
            )
            if result.returncode != 0:
                err = result.stderr or result.stdout
                if "No indexed repositories found" in err:
                    return "[AXODEX ERROR] No index found. Run 'axodex_analyze' first."
                return f"[AXODEX ERROR] {err}"
            return result.stdout.strip()
        except FileNotFoundError:
            return "[AXODEX ERROR] 'node' not found. Please install Node.js."
        except subprocess.TimeoutExpired:
            return "[AXODEX ERROR] Operation timed out (120s)."
        except Exception as e:
            return f"[AXODEX EXCEPTION] {e}"

    def smart_read(self, symbol_name: str) -> str:
        """
        Superior read: Gets symbol definition AND its immediate graph neighbors.
        This provides the agent with 10x the context of a normal read for the same tokens.
        """
        ctx = self.context(symbol_name)
        if "[AXODEX ERROR]" in ctx:
            return ctx
        
        # We can append related information or filter it here to maximize ROI
        return f"[Architectural Slice: {symbol_name}]\n{ctx}"

    def query(self, query: str, limit: int = 10) -> str:
        """Semantic search for concepts or execution flows."""
        return self._run(["query", query, "--limit", str(limit)])

    def context(self, name: str) -> str:
        """Get full context for a symbol (callers, callees, flows)."""
        return self._run(["context", name])

    def impact(self, target: str, direction: str = "upstream") -> str:
        """Analyze blast radius of changing a symbol."""
        return self._run(["impact", target, "--direction", direction])

    def detect_changes(self) -> str:
        """Verify which symbols and processes are affected by current edits."""
        return self._run(["detect_changes"])

    def analyze(self) -> str:
        """Force a refresh of the codebase index."""
        return self._run(["analyze"])

    def status(self) -> str:
        """Check index freshness and repo stats."""
        return self._run(["status"])
