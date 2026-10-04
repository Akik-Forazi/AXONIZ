"""
AXONIZ FileTools — production-grade file operations
Adds: diff-aware edit, multi-file read, patch apply, safe backup, ripgrep-style search
"""

import os
import glob
import shutil
import difflib
import re
from pathlib import Path
from datetime import datetime


class FileTools:
    def __init__(self, workspace: str = "."):
        self.workspace = os.path.abspath(workspace)

    def _resolve(self, path: str) -> str:
        p = Path(path)
        return str(p) if p.is_absolute() else str(Path(self.workspace) / path)

    # ── READ ──────────────────────────────────────────────────────────────────

    def read(self, path: str, start_line: int = None, end_line: int = None) -> str:
        """Read file with line numbers. Optional start/end line range."""
        full = self._resolve(path)
        try:
            with open(full, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
            total = len(lines)
            if start_line or end_line:
                s = max(0, (start_line or 1) - 1)
                e = min(total, end_line or total)
                lines = lines[s:e]
                offset = s
            else:
                offset = 0
            numbered = "".join(f"{i+offset+1:4d} │ {l}" for i, l in enumerate(lines))
            rng = f" lines {offset+1}-{offset+len(lines)}" if (start_line or end_line) else ""
            return f"── {path}{rng} ({total} total) ──\n{numbered}"
        except FileNotFoundError:
            return f"[ERROR] Not found: {full}"
        except Exception as e:
            return f"[ERROR] Cannot read {full}: {e}"

    def read_many(self, paths: list) -> str:
        """Read multiple files at once. paths is a list of strings."""
        parts = []
        for p in paths:
            parts.append(self.read(p))
        return "\n\n".join(parts)

    # ── WRITE ─────────────────────────────────────────────────────────────────

    def write(self, path: str, content: str) -> str:
        """Write file, auto-create directories."""
        full = self._resolve(path)
        os.makedirs(os.path.dirname(full) or ".", exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        lines = content.count("\n") + 1
        return f"[OK] Wrote {full} ({lines} lines, {len(content)} chars)"


    def append(self, path: str, content: str) -> str:
        full = self._resolve(path)
        with open(full, "a", encoding="utf-8") as f:
            f.write(content)
        return f"[OK] Appended {len(content)} chars to {full}"

    # ── EDIT (diff-aware) ─────────────────────────────────────────────────────

    def edit(self, path: str, old: str, new: str) -> str:
        """Find-and-replace with diff preview. Shows what changed."""
        full = self._resolve(path)
        try:
            with open(full, "r", encoding="utf-8") as f:
                original = f.read()
            if old not in original:
                # Try fuzzy: strip leading/trailing whitespace per line
                stripped_old = "\n".join(l.strip() for l in old.splitlines())
                stripped_orig = "\n".join(l.strip() for l in original.splitlines())
                if stripped_old not in stripped_orig:
                    # Show nearest match for debugging
                    lines = original.splitlines()
                    first_line = old.splitlines()[0].strip()
                    matches = [i+1 for i,l in enumerate(lines) if first_line[:30] in l]
                    hint = f" (nearest match at lines {matches[:3]})" if matches else ""
                    return f"[ERROR] Text not found in {path}{hint}\nSearched for:\n{old[:200]}"
            count   = original.count(old)
            updated = original.replace(old, new)
            # Save backup
            backup  = full + ".bak"
            with open(backup, "w", encoding="utf-8") as f:
                f.write(original)
            with open(full, "w", encoding="utf-8") as f:
                f.write(updated)
            # Show diff summary
            diff = list(difflib.unified_diff(
                original.splitlines(), updated.splitlines(),
                fromfile=f"a/{path}", tofile=f"b/{path}", lineterm="", n=2
            ))
            diff_preview = "\n".join(diff[:30])
            return f"[OK] Edited {path} ({count} replacement(s))\n{diff_preview}"
        except FileNotFoundError:
            return f"[ERROR] File not found: {full}"
        except Exception as e:
            return f"[ERROR] Edit failed: {e}"

    def patch(self, path: str, unified_diff: str) -> str:
        """Apply a unified diff patch to a file."""
        full = self._resolve(path)
        try:
            with open(full, "r", encoding="utf-8") as f:
                original_lines = f.readlines()
            # Parse hunks from unified diff
            result_lines = list(original_lines)
            hunks = re.findall(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*?)(?=\n@@|\Z)', unified_diff, re.DOTALL)
            offset = 0
            for hunk in hunks:
                old_start = int(hunk[0]) - 1
                old_len   = int(hunk[1]) if hunk[1] else 1
                new_start = int(hunk[2]) - 1
                body      = hunk[4]
                removes, adds = [], []
                for line in body.splitlines()[1:]:
                    if line.startswith("-"): removes.append(line[1:] + "\n")
                    elif line.startswith("+"): adds.append(line[1:] + "\n")
                pos = old_start + offset
                result_lines[pos:pos+old_len] = adds
                offset += len(adds) - old_len
            with open(full, "w", encoding="utf-8") as f:
                f.writelines(result_lines)
            return f"[OK] Patch applied to {path}"
        except Exception as e:
            return f"[ERROR] Patch failed: {e}"


    # ── SEARCH ────────────────────────────────────────────────────────────────

    def search(self, path: str = ".", pattern: str = "*") -> str:
        """Glob file search. pattern can be *.py, **/*.ts, etc."""
        full = self._resolve(path)
        matches = glob.glob(os.path.join(full, "**", pattern), recursive=True)
        # Exclude common noise
        matches = [m for m in matches if not any(
            x in m for x in [".git", "__pycache__", "node_modules", ".egg-info", "dist\\", "build\\"]
        )]
        if not matches:
            return f"No files matching '{pattern}' in {path}"
        lines = [f"Found {len(matches)} file(s) matching '{pattern}':"]
        for m in matches[:60]:
            rel = os.path.relpath(m, full)
            size = os.path.getsize(m)
            lines.append(f"  {rel}  ({size:,} B)")
        return "\n".join(lines)

    def grep(self, path: str = ".", pattern: str = "", file_pattern: str = "*.py",
             case_sensitive: bool = True, max_results: int = 50) -> str:
        """Search file contents for a text/regex pattern. Like ripgrep."""
        full = self._resolve(path)
        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            regex = re.compile(pattern, flags)
        except re.error as e:
            # Fallback to literal search
            regex = re.compile(re.escape(pattern), flags)

        files = glob.glob(os.path.join(full, "**", file_pattern), recursive=True)
        files = [f for f in files if not any(
            x in f for x in [".git", "__pycache__", "node_modules", ".egg-info"]
        )]
        results = []
        for fpath in files:
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    for i, line in enumerate(f, 1):
                        if regex.search(line):
                            rel = os.path.relpath(fpath, full)
                            results.append(f"  {rel}:{i}: {line.rstrip()}")
                            if len(results) >= max_results:
                                break
            except Exception:
                continue
            if len(results) >= max_results:
                break

        if not results:
            return f"No matches for '{pattern}' in {file_pattern} files under {path}"
        header = f"grep '{pattern}' in {file_pattern} — {len(results)} match(es):"
        return header + "\n" + "\n".join(results)

    # ── FS OPERATIONS ─────────────────────────────────────────────────────────

    def list_dir(self, path: str = ".") -> str:
        """Directory listing with sizes, sorted dirs-first."""
        full = self._resolve(path)
        try:
            items = sorted(os.listdir(full))
            dirs  = [i for i in items if os.path.isdir(os.path.join(full, i))]
            files = [i for i in items if not os.path.isdir(os.path.join(full, i))]
            result = []
            for d in dirs:
                if d in (".git", "__pycache__", "node_modules", ".egg-info"): continue
                result.append(f"  [DIR]  {d}/")
            for item in files:
                size = os.path.getsize(os.path.join(full, item))
                result.append(f"  [FILE] {item:<40} {size:>8,} B")
            rel = os.path.relpath(full, self.workspace)
            return f"── {rel}/ ({len(dirs)} dirs, {len(files)} files) ──\n" + "\n".join(result)
        except Exception as e:
            return f"[ERROR] Cannot list {full}: {e}"

    def delete(self, path: str) -> str:
        full = self._resolve(path)
        try:
            if os.path.isfile(full):
                os.remove(full)
                return f"[OK] Deleted file: {path}"
            elif os.path.isdir(full):
                shutil.rmtree(full)
                return f"[OK] Deleted directory: {path}"
            return f"[ERROR] Not found: {full}"
        except Exception as e:
            return f"[ERROR] Delete failed: {e}"

    def copy(self, src: str, dst: str) -> str:
        shutil.copy2(self._resolve(src), self._resolve(dst))
        return f"[OK] Copied {src} → {dst}"

    def move(self, src: str, dst: str) -> str:
        shutil.move(self._resolve(src), self._resolve(dst))
        return f"[OK] Moved {src} → {dst}"

    def make_dir(self, path: str) -> str:
        full = self._resolve(path)
        os.makedirs(full, exist_ok=True)
        return f"[OK] Created directory: {path}"

    def file_info(self, path: str) -> str:
        """Stat a file — size, modified time, permissions."""
        full = self._resolve(path)
        try:
            st   = os.stat(full)
            mtime = datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            return (f"── {path} ──\n"
                    f"  size:     {st.st_size:,} bytes\n"
                    f"  modified: {mtime}\n"
                    f"  type:     {'directory' if os.path.isdir(full) else 'file'}")
        except Exception as e:
            return f"[ERROR] {e}"

