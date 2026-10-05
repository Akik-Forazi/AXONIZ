"""
AXONIZ ShellTools — Windows-aware shell execution
Adds: async/bg processes, output truncation, env injection, timeout handling
"""

import subprocess
import sys
import io
import os
import platform
import contextlib
import traceback
import threading
from typing import Optional

IS_WINDOWS = platform.system() == "Windows"
MAX_OUTPUT = 8000   # chars, to avoid context overflow

_UNIX_TO_WIN = {
    "ls":    "dir /b",
    "cat":   "type",
    "rm":    "del",
    "cp":    "copy",
    "mv":    "move",
    "grep":  "findstr",
    "touch": "echo.>",
    "clear": "cls",
    "pwd":   "cd",
    "which": "where",
    "echo":  "echo",
}


class ShellTools:
    def __init__(self, workspace: str = "."):
        self.workspace = os.path.abspath(workspace)

    def run(self, command: str, timeout: int = 60, env: dict = None) -> str:
        """Run a shell command. Windows-aware, auto-translates unix basics."""
        cmd = command.strip()
        if not cmd:
            return "[ERROR] Empty command"

        if IS_WINDOWS:
            first = cmd.split()[0].lower()
            if first in _UNIX_TO_WIN:
                win = _UNIX_TO_WIN[first]
                cmd = cmd.replace(first, win, 1)
                note = f"[auto] '{first}' → '{win}'\n"
            else:
                note = ""
            result = self._run_raw(cmd, timeout, env)
            return note + result if note else result

        return self._run_raw(cmd, timeout, env)

    def _run_raw(self, command: str, timeout: int = 60, env: dict = None) -> str:
        merged_env = {**os.environ}
        if env:
            merged_env.update(env)
        try:
            proc = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.workspace,
                env=merged_env,
            )
            out  = proc.stdout.strip()
            err  = proc.stderr.strip()
            code = proc.returncode

            if len(out) > MAX_OUTPUT:
                out = out[:MAX_OUTPUT] + f"\n… [truncated, {len(out)} total chars]"
            if len(err) > 2000:
                err = err[:2000] + "… [truncated]"

            parts = [f"$ {command}  [exit {code}]"]
            if out:  parts.append(out)
            if err:  parts.append(f"stderr: {err}")
            if not out and not err: parts.append("(no output)")
            return "\n".join(parts)

        except subprocess.TimeoutExpired:
            return f"[TIMEOUT] Command killed after {timeout}s: {command}"
        except Exception as e:
            return f"[ERROR] Shell: {e}"

    def run_bg(self, command: str) -> str:
        """Start a background process (non-blocking). Returns PID."""
        try:
            flags = subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0
            proc  = subprocess.Popen(
                command, shell=True, cwd=self.workspace,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=flags,
            )
            return f"[OK] Background process started  pid={proc.pid}  cmd={command}"
        except Exception as e:
            return f"[ERROR] Background process failed: {e}"

    def run_python(self, code: str) -> str:
        """Execute Python inline, capture output."""
        out_buf = io.StringIO()
        err_buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
                exec(compile(code, "<axoniz>", "exec"), {"__name__": "__main__"})
            out = out_buf.getvalue()
            err = err_buf.getvalue()
            parts = [f"python ({len(code)} chars)"]
            if out: parts.append(out[:MAX_OUTPUT])
            if err: parts.append(f"stderr:\n{err[:2000]}")
            if not out and not err: parts.append("(no output)")
            return "\n".join(parts)
        except Exception:
            return f"[PYTHON ERROR]\n{traceback.format_exc()[:3000]}"

    def which(self, name: str) -> str:
        """Check if a program is available in PATH."""
        import shutil
        path = shutil.which(name)
        return f"[OK] {name} → {path}" if path else f"[NOT FOUND] {name} not in PATH"

    def env_info(self) -> str:
        """Return useful environment info."""
        import sys
        return (
            f"Python {sys.version}\n"
            f"OS: {platform.system()} {platform.version()}\n"
            f"CWD: {self.workspace}\n"
            f"PATH entries: {len(os.environ.get('PATH','').split(os.pathsep))}"
        )
