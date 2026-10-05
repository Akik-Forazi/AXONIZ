"""
axoniz.core.intelligence.ast_index
=====================================
Phase 3 — Living Codebase Understanding

Cursor and Copilot do text search. They're glorified grep.
axoniz builds a real AST index of your entire workspace:
  - Every class, function, method, variable
  - Every import and what imports what
  - Every call site (who calls what)
  - Symbol cross-references
  - "What will break if I change X?"

Before editing anything, axoniz knows what will break.
After editing, it compares semantic meaning, not just text.
This is what makes senior developers indispensable.

Storage: SQLite at ~/.axoniz/ast_index.db (per workspace)
Incremental: only re-indexes changed files (mtime-based)
"""

import ast
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Set, Tuple

from axoniz.core.config import AXONIZ_HOME
from axoniz.core.debug import debug, info, warn

AST_INDEX_DIR = os.path.join(AXONIZ_HOME, "ast_indexes")
os.makedirs(AST_INDEX_DIR, exist_ok=True)

_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS files (
    path        TEXT PRIMARY KEY,
    mtime       REAL,
    size        INTEGER,
    hash        TEXT,
    language    TEXT DEFAULT 'python',
    indexed_at  REAL
);

CREATE TABLE IF NOT EXISTS symbols (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,  -- class/function/method/variable/import
    line_start  INTEGER,
    line_end    INTEGER,
    parent      TEXT,           -- class name if method
    signature   TEXT,           -- full def line
    docstring   TEXT,
    is_public   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS imports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    module      TEXT NOT NULL,
    names       TEXT,           -- JSON list of imported names
    alias       TEXT,
    line        INTEGER,
    is_from     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    caller      TEXT,           -- function/method making the call
    callee      TEXT NOT NULL,  -- function/attribute being called
    line        INTEGER,
    args_count  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS symbol_refs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    line        INTEGER,
    context     TEXT
);

CREATE INDEX IF NOT EXISTS idx_sym_name   ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_sym_kind   ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_sym_file   ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_imp_module ON imports(module);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee);
CREATE INDEX IF NOT EXISTS idx_ref_symbol ON symbol_refs(symbol_name);
"""


@dataclass
class Symbol:
    name:      str
    kind:      str       # class / function / method / variable / import
    file_path: str
    line:      int
    signature: str = ""
    docstring: str = ""
    parent:    str = ""


@dataclass
class CallSite:
    file_path: str
    caller:    str
    callee:    str
    line:      int


@dataclass
class ImpactAnalysis:
    symbol:       str
    direct_calls: List[CallSite]
    affected_files: List[str]
    risk_level:   str    # low / medium / high / critical
    summary:      str


class ASTIndexer:
    """
    Builds and queries a real AST index of a Python workspace.

    The key capability:
        "Before you edit function X, here's everything that calls it,
         everything it imports, and what will break."
    """

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        ws_hash   = hashlib.md5(self.workspace.encode()).hexdigest()[:8]
        db_path   = os.path.join(AST_INDEX_DIR, f"ast_{ws_hash}.db")
        self._conn = sqlite3.connect(db_path, check_same_thread=False, timeout=10)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._init_schema()
        self._index_thread: Optional[threading.Thread] = None

    def _init_schema(self):
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # ── Indexing ──────────────────────────────────────────────────────────────

    def index_workspace(self, max_files: int = 500, force: bool = False) -> Dict:
        """
        Index all Python files in workspace. Only re-indexes changed files.
        Returns stats dict.
        """
        py_files = self._find_python_files(max_files)
        new_count = changed_count = skipped_count = 0

        for fpath in py_files:
            try:
                mtime = os.path.getmtime(fpath)
                with self._lock:
                    row = self._conn.execute(
                        "SELECT mtime FROM files WHERE path=?", (fpath,)
                    ).fetchone()
                if row and row["mtime"] == mtime and not force:
                    skipped_count += 1
                    continue
                self._index_file(fpath, mtime)
                if row:
                    changed_count += 1
                else:
                    new_count += 1
            except Exception as e:
                debug(f"[AST] Failed to index {fpath}: {e}")

        return {
            "files_indexed": new_count + changed_count,
            "files_new":     new_count,
            "files_changed": changed_count,
            "files_skipped": skipped_count,
            "total":         len(py_files),
        }

    def index_workspace_async(self):
        """Background indexing — doesn't block the agent."""
        if self._index_thread and self._index_thread.is_alive():
            return
        self._index_thread = threading.Thread(
            target=self.index_workspace, daemon=True, name="ast-indexer"
        )
        self._index_thread.start()

    def _find_python_files(self, max_files: int) -> List[str]:
        skip_dirs = {".git", "__pycache__", "node_modules", ".egg-info",
                     "dist", "build", ".axoniz", "venv", "env", ".venv"}
        files = []
        for root, dirs, fnames in os.walk(self.workspace):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for fn in fnames:
                if fn.endswith(".py"):
                    files.append(os.path.join(root, fn))
                    if len(files) >= max_files:
                        return files
        return files

    def _index_file(self, fpath: str, mtime: float):
        """Parse one Python file and update all tables."""
        try:
            with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                source = f.read()
        except Exception:
            return

        try:
            tree = ast.parse(source, filename=fpath)
        except SyntaxError:
            return

        file_hash = hashlib.md5(source.encode()).hexdigest()
        lines     = source.splitlines()

        symbols: List[tuple] = []
        imports_: List[tuple] = []
        calls:   List[tuple] = []

        visitor = _ASTVisitor(fpath, lines)
        visitor.visit(tree)

        with self._lock:
            # Clear old data for this file
            for tbl in ("symbols", "imports", "calls", "symbol_refs"):
                self._conn.execute(f"DELETE FROM {tbl} WHERE file_path=?", (fpath,))

            # Symbols
            for sym in visitor.symbols:
                self._conn.execute(
                    "INSERT INTO symbols(file_path,name,kind,line_start,line_end,parent,signature,docstring,is_public)"
                    " VALUES(?,?,?,?,?,?,?,?,?)",
                    (fpath, sym["name"], sym["kind"], sym["line"], sym.get("line_end", sym["line"]),
                     sym.get("parent",""), sym.get("signature",""), sym.get("docstring","")[:300],
                     int(not sym["name"].startswith("_")))
                )

            # Imports
            for imp in visitor.imports:
                self._conn.execute(
                    "INSERT INTO imports(file_path,module,names,alias,line,is_from)"
                    " VALUES(?,?,?,?,?,?)",
                    (fpath, imp["module"], json.dumps(imp.get("names",[])),
                     imp.get("alias",""), imp["line"], int(imp.get("is_from",False)))
                )

            # Calls
            for call in visitor.calls:
                self._conn.execute(
                    "INSERT INTO calls(file_path,caller,callee,line,args_count)"
                    " VALUES(?,?,?,?,?)",
                    (fpath, call.get("caller",""), call["callee"],
                     call["line"], call.get("args_count",0))
                )

            # File record
            self._conn.execute(
                "INSERT OR REPLACE INTO files(path,mtime,size,hash,indexed_at)"
                " VALUES(?,?,?,?,?)",
                (fpath, mtime, len(source), file_hash, time.time())
            )
            self._conn.commit()

    # ── Queries ───────────────────────────────────────────────────────────────

    def find_symbol(self, name: str, kind: str = None) -> List[Symbol]:
        """Find where a class/function/variable is defined."""
        q = "SELECT * FROM symbols WHERE name LIKE ?"
        params = [f"%{name}%"]
        if kind:
            q += " AND kind=?"
            params.append(kind)
        q += " ORDER BY is_public DESC, name LIMIT 20"
        with self._lock:
            rows = self._conn.execute(q, params).fetchall()
        return [Symbol(
            name=r["name"], kind=r["kind"], file_path=r["file_path"],
            line=r["line_start"], signature=r["signature"] or "",
            docstring=r["docstring"] or "", parent=r["parent"] or ""
        ) for r in rows]

    def find_callers(self, function_name: str) -> List[CallSite]:
        """Find all places that call a function — 'who calls X?'"""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM calls WHERE callee LIKE ? ORDER BY file_path, line",
                (f"%{function_name}%",)
            ).fetchall()
        return [CallSite(
            file_path=r["file_path"], caller=r["caller"] or "",
            callee=r["callee"], line=r["line"]
        ) for r in rows]

    def find_usages(self, symbol_name: str) -> List[Dict]:
        """Where is a symbol used? Combines calls + imports."""
        calls = self.find_callers(symbol_name)
        with self._lock:
            imp_rows = self._conn.execute(
                "SELECT file_path, line FROM imports WHERE names LIKE ? OR module LIKE ?",
                (f"%{symbol_name}%", f"%{symbol_name}%")
            ).fetchall()
        usages = [{"type": "call", "file": c.file_path, "line": c.line,
                   "caller": c.caller, "via": c.callee} for c in calls]
        usages += [{"type": "import", "file": r["file_path"],
                    "line": r["line"]} for r in imp_rows]
        return usages

    def what_imports(self, module_name: str) -> List[str]:
        """Which files import a given module?"""
        with self._lock:
            rows = self._conn.execute(
                "SELECT DISTINCT file_path FROM imports WHERE module LIKE ?",
                (f"%{module_name}%",)
            ).fetchall()
        return [r["file_path"] for r in rows]

    def impact_analysis(self, symbol_name: str) -> ImpactAnalysis:
        """
        Before editing symbol_name, what will break?
        Returns an ImpactAnalysis with call sites, affected files, risk level.
        """
        callers   = self.find_callers(symbol_name)
        usages    = self.find_usages(symbol_name)
        affected  = list(set(
            c.file_path for c in callers if c.file_path != ""
        ))

        # Risk scoring
        n_callers = len(callers)
        n_files   = len(affected)

        if n_callers == 0 and n_files == 0:
            risk = "low"
        elif n_callers < 3:
            risk = "low"
        elif n_callers < 8 or n_files < 3:
            risk = "medium"
        elif n_callers < 20:
            risk = "high"
        else:
            risk = "critical"

        parts = []
        if callers:
            parts.append(f"Called {n_callers}x across {n_files} file(s)")
        if not callers:
            parts.append("Not called anywhere — safe to edit")

        summary = f"Impact of changing '{symbol_name}': {', '.join(parts) or 'minimal'}"

        return ImpactAnalysis(
            symbol=symbol_name,
            direct_calls=callers,
            affected_files=affected,
            risk_level=risk,
            summary=summary,
        )

    def get_file_context(self, file_path: str) -> str:
        """
        Before editing a file, get full context:
        what's defined, what's imported, what calls what.
        """
        abs_path = file_path if os.path.isabs(file_path) else os.path.join(self.workspace, file_path)
        with self._lock:
            syms = self._conn.execute(
                "SELECT name, kind, line_start, signature FROM symbols WHERE file_path=? ORDER BY line_start",
                (abs_path,)
            ).fetchall()
            imps = self._conn.execute(
                "SELECT module, names FROM imports WHERE file_path=? ORDER BY line",
                (abs_path,)
            ).fetchall()

        lines = [f"[AST Context: {os.path.relpath(abs_path, self.workspace)}]"]

        if imps:
            lines.append("Imports:")
            for r in imps[:10]:
                names = json.loads(r["names"] or "[]")
                if names:
                    lines.append(f"  from {r['module']} import {', '.join(names[:4])}")
                else:
                    lines.append(f"  import {r['module']}")

        if syms:
            lines.append("Symbols:")
            for r in syms[:20]:
                indent = "  " if r["kind"] == "method" else ""
                lines.append(f"  {indent}{r['kind']} {r['name']}  (line {r['line_start']})")

        return "\n".join(lines)

    def stats(self) -> Dict:
        """Index statistics."""
        with self._lock:
            n_files   = self._conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
            n_symbols = self._conn.execute("SELECT COUNT(*) FROM symbols").fetchone()[0]
            n_calls   = self._conn.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
            n_imports = self._conn.execute("SELECT COUNT(*) FROM imports").fetchone()[0]
            kinds     = {r["kind"]: r["cnt"] for r in self._conn.execute(
                "SELECT kind, COUNT(*) as cnt FROM symbols GROUP BY kind"
            ).fetchall()}
        return {
            "files_indexed": n_files,
            "symbols":       n_symbols,
            "calls":         n_calls,
            "imports":       n_imports,
            "by_kind":       kinds,
        }

    def format_impact(self, ia: ImpactAnalysis, max_callers: int = 10) -> str:
        """Format impact analysis as a readable string for the agent."""
        lines = [
            f"Impact Analysis: '{ia.symbol}'",
            f"  Risk level: {ia.risk_level.upper()}",
            f"  {ia.summary}",
        ]
        if ia.direct_calls:
            lines.append(f"  Callers ({len(ia.direct_calls)} total):")
            for c in ia.direct_calls[:max_callers]:
                rel = os.path.relpath(c.file_path, self.workspace)
                lines.append(f"    {rel}:{c.line}  {c.caller or '?'} → {c.callee}")
            if len(ia.direct_calls) > max_callers:
                lines.append(f"    ... and {len(ia.direct_calls)-max_callers} more")
        if not ia.direct_calls:
            lines.append("  No callers found — safe to modify")
        return "\n".join(lines)

    def summary(self) -> str:
        """One-line summary for swarm orchestrator context injection."""
        s = self.stats()
        if s["files_indexed"] == 0:
            return ""
        return (
            f"{s['files_indexed']} Python files | "
            f"{s.get('symbols', 0)} symbols | "
            f"{s.get('calls', 0)} call sites"
        )

    def as_tool_map(self) -> Dict:
        """Inject AST tools into agent._tool_map."""
        return {
            "ast_find_symbol":  self._t_find_symbol,
            "ast_find_callers": self._t_find_callers,
            "ast_impact":       self._t_impact,
            "ast_file_context": self._t_file_context,
            "ast_stats":        self._t_stats,
            "ast_reindex":      self._t_reindex,
        }

    # ── Tool implementations ──────────────────────────────────────────────────

    def _t_find_symbol(self, name: str, kind: str = None) -> str:
        syms = self.find_symbol(name, kind)
        if not syms:
            return f"Symbol '{name}' not found in index."
        lines = [f"Found {len(syms)} match(es) for '{name}':"]
        for s in syms:
            rel = os.path.relpath(s.file_path, self.workspace)
            parent = f" (in {s.parent})" if s.parent else ""
            lines.append(f"  {s.kind} {s.name}{parent} — {rel}:{s.line}")
            if s.signature:
                lines.append(f"    {s.signature[:100]}")
        return "\n".join(lines)

    def _t_find_callers(self, function_name: str) -> str:
        callers = self.find_callers(function_name)
        if not callers:
            return f"No callers found for '{function_name}'."
        lines = [f"'{function_name}' is called {len(callers)}x:"]
        for c in callers[:15]:
            rel = os.path.relpath(c.file_path, self.workspace)
            lines.append(f"  {rel}:{c.line}  (in {c.caller or 'module level'})")
        return "\n".join(lines)

    def _t_impact(self, symbol_name: str) -> str:
        ia = self.impact_analysis(symbol_name)
        return self.format_impact(ia)

    def _t_file_context(self, path: str) -> str:
        return self.get_file_context(path)

    def _t_stats(self) -> str:
        s = self.stats()
        return (
            f"AST Index: {s['files_indexed']} files | "
            f"{s['symbols']} symbols | {s['calls']} calls | "
            f"{s['imports']} imports\n"
            f"By kind: " + ", ".join(f"{k}={v}" for k, v in s["by_kind"].items())
        )

    def _t_reindex(self, force: bool = False) -> str:
        stats = self.index_workspace(force=force)
        return (
            f"Re-indexed: {stats['files_indexed']} files "
            f"({stats['files_new']} new, {stats['files_changed']} changed, "
            f"{stats['files_skipped']} unchanged)"
        )


# ─── AST Visitor ─────────────────────────────────────────────────────────────

class _ASTVisitor(ast.NodeVisitor):
    """Visits an AST and collects symbols, imports, and calls."""

    def __init__(self, file_path: str, source_lines: List[str]):
        self.file_path   = file_path
        self.lines       = source_lines
        self.symbols:    List[Dict] = []
        self.imports:    List[Dict] = []
        self.calls:      List[Dict] = []
        self._current_class:    str = ""
        self._current_function: str = ""

    def _line_text(self, lineno: int) -> str:
        if lineno and 0 < lineno <= len(self.lines):
            return self.lines[lineno - 1].strip()
        return ""

    def _get_docstring(self, node) -> str:
        try:
            return (ast.get_docstring(node) or "")[:300]
        except Exception:
            return ""

    def visit_ClassDef(self, node: ast.ClassDef):
        old = self._current_class
        self._current_class = node.name
        self.symbols.append({
            "name":      node.name,
            "kind":      "class",
            "line":      node.lineno,
            "line_end":  node.end_lineno if hasattr(node, "end_lineno") else node.lineno,
            "signature": self._line_text(node.lineno),
            "docstring": self._get_docstring(node),
        })
        self.generic_visit(node)
        self._current_class = old

    def visit_FunctionDef(self, node: ast.FunctionDef):
        old = self._current_function
        kind = "method" if self._current_class else "function"
        self._current_function = node.name
        self.symbols.append({
            "name":      node.name,
            "kind":      kind,
            "line":      node.lineno,
            "line_end":  node.end_lineno if hasattr(node, "end_lineno") else node.lineno,
            "parent":    self._current_class,
            "signature": self._line_text(node.lineno),
            "docstring": self._get_docstring(node),
        })
        self.generic_visit(node)
        self._current_function = old

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            self.imports.append({
                "module":  alias.name,
                "names":   [],
                "alias":   alias.asname or "",
                "line":    node.lineno,
                "is_from": False,
            })
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.module:
            self.imports.append({
                "module":  node.module,
                "names":   [a.name for a in node.names],
                "alias":   "",
                "line":    node.lineno,
                "is_from": True,
            })
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        callee = ""
        try:
            if isinstance(node.func, ast.Name):
                callee = node.func.id
            elif isinstance(node.func, ast.Attribute):
                callee = f"{_attr_chain(node.func)}"
        except Exception:
            pass

        if callee:
            self.calls.append({
                "caller":     self._current_function,
                "callee":     callee,
                "line":       node.lineno,
                "args_count": len(node.args),
            })
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and not self._current_function:
                self.symbols.append({
                    "name":   target.id,
                    "kind":   "variable",
                    "line":   node.lineno,
                    "parent": self._current_class,
                })
        self.generic_visit(node)


def _attr_chain(node: ast.Attribute) -> str:
    """Reconstruct a dotted attribute chain, e.g. self.file_tools.read."""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))
