"""
AXONIZ-ZERO History — v2
Stores sessions in ~/.axoniz/history/ as JSONL files.
Supports saving/loading full chat history for conversation resume.
"""

import json
import os
from datetime import datetime
from axoniz.core.config import HISTORY_DIR


class ChatHistory:
    def __init__(self):
        os.makedirs(HISTORY_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        self._file    = os.path.join(HISTORY_DIR, f"session_{ts}.jsonl")
        self._session = []   # in-memory message list for LLM context
        self._title   = ""   # first user message used as display title

    # ── Append a raw log entry (persisted to JSONL) ───────────────────────────

    def append(self, role: str, content: str, **meta):
        entry = {"ts": datetime.now().isoformat(), "role": role, "content": content, **meta}
        try:
            with open(self._file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:
            pass

    # ── In-memory session (LLM context window) ────────────────────────────────

    def append_session(self, msg: dict):
        self._session.append(msg)
        # capture first user message as title
        if not self._title and msg.get("role") == "user":
            self._title = msg.get("content", "")[:60]
            self._write_meta()

    def get_session(self) -> list:
        return list(self._session)

    def distill(self, backend) -> str:
        """
        Compress the current session context into a concise executive summary.
        Safe version for 3B models.
        """
        if len(self._session) < 6:
            return ""
            
        # Extract meaningful turns for summary
        turns = []
        for m in self._session:
            role = m.get("role", "user").upper()
            content = str(m.get("content", ""))
            # Don't summarize previous summaries to avoid data loss
            if "MARSHAL'S EXECUTIVE SUMMARY" in content:
                continue
            turns.append(f"{role}: {content[:200]}")

        prompt = (
            "SYSTEM: You are a Cognitive Distiller.\n"
            "TASK: Summarize the conversation history into 3 short bullet points.\n"
            "HISTORY:\n" + "\n".join(turns[-10:]) + "\n\nSUMMARY:"
        )
        
        try:
            # Pass the backend directly to avoid circular agent imports
            summary = backend.complete(prompt, max_tokens=200)
            if summary and len(summary) > 10:
                # Keep the original system prompt (usually the first message)
                # and replace the middle history with the new summary.
                system_prompt = self._session[0] if self._session and self._session[0]["role"] == "system" else None
                
                self._session = []
                if system_prompt:
                    self._session.append(system_prompt)
                    
                self._session.append({
                    "role": "system", 
                    "content": f"MARSHAL'S EXECUTIVE SUMMARY (CONTEXT DISTILLATION):\n{summary}"
                })
                # Always keep the very last message to maintain continuity
                if turns:
                    self._session.append({"role": "user", "content": "[CONTINUING FROM SUMMARY]"})
                    
                return summary
        except Exception:
            # Fallback: aggressive slice
            if len(self._session) > 4:
                self._session = [self._session[0]] + self._session[-3:]
            return "[FALLBACK DISTILLATION APPLIED]"
        return ""

    def clear_session(self):
        self._session.clear()

    # ── Metadata (title stored as first line comment) ─────────────────────────

    def _write_meta(self):
        """Write a metadata header to the session file."""
        meta_path = self._file.replace(".jsonl", ".meta.json")
        try:
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({
                    "title": self._title,
                    "file":  os.path.basename(self._file),
                    "ts":    datetime.now().isoformat(),
                }, f, ensure_ascii=False)
        except Exception:
            pass

    # ── List all sessions ─────────────────────────────────────────────────────

    def get_sessions(self) -> list:
        """Return list of session dicts with id, title, ts, message_count."""
        try:
            files = sorted(
                [f for f in os.listdir(HISTORY_DIR) if f.endswith(".jsonl")],
                reverse=True
            )
            sessions = []
            for fname in files[:100]:
                path = os.path.join(HISTORY_DIR, fname)
                meta_path = path.replace(".jsonl", ".meta.json")
                title = fname
                ts_str = ""
                count  = 0

                # Try metadata file first (fast)
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, "r", encoding="utf-8") as mf:
                            m = json.load(mf)
                            title  = m.get("title", fname) or fname
                            ts_str = m.get("ts", "")
                    except Exception:
                        pass

                # Count lines / extract title fallback from first entry
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.strip():
                                count += 1
                                if title == fname:
                                    try:
                                        entry = json.loads(line)
                                        if entry.get("role") == "user":
                                            title = entry.get("content","")[:60] or fname
                                    except Exception:
                                        pass
                except Exception:
                    pass

                # Extract timestamp from filename fallback
                if not ts_str:
                    try:
                        ts_part = fname.replace("session_","").replace(".jsonl","")
                        dt = datetime.strptime(ts_part, "%Y%m%d_%H%M%S")
                        ts_str = dt.isoformat()
                    except Exception:
                        ts_str = ""

                sessions.append({
                    "id":      fname,
                    "title":   title,
                    "ts":      ts_str,
                    "count":   count,
                })
            return sessions
        except Exception:
            return []

    # ── Load a specific session ───────────────────────────────────────────────

    def load_session_file(self, filename: str) -> list:
        """Load all log entries from a session JSONL file."""
        path = os.path.join(HISTORY_DIR, filename)
        entries = []
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        try:
                            entries.append(json.loads(line))
                        except Exception:
                            pass
        except Exception:
            pass
        return entries

    def delete_session(self, filename: str) -> bool:
        """Delete a session file and its metadata."""
        try:
            path = os.path.join(HISTORY_DIR, filename)
            if os.path.exists(path):
                os.remove(path)
            meta = path.replace(".jsonl", ".meta.json")
            if os.path.exists(meta):
                os.remove(meta)
            return True
        except Exception:
            return False

    def rename_session(self, filename: str, new_title: str) -> bool:
        """Update the metadata title for a session."""
        try:
            path = os.path.join(HISTORY_DIR, filename)
            if not os.path.exists(path):
                return False
            meta_path = path.replace(".jsonl", ".meta.json")
            meta = {}
            if os.path.exists(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                except Exception:
                    pass
            meta["title"] = new_title
            meta["file"]  = filename
            if "ts" not in meta:
                meta["ts"] = datetime.now().isoformat()
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False)
            return True
        except Exception:
            return False

    def clear_all_sessions(self) -> int:
        """Delete all session files. Returns count deleted."""
        count = 0
        try:
            for fname in os.listdir(HISTORY_DIR):
                p = os.path.join(HISTORY_DIR, fname)
                if os.path.isfile(p):
                    try:
                        os.remove(p)
                        count += 1
                    except Exception:
                        pass
        except Exception:
            pass
        return count

    # ── Backwards compat ──────────────────────────────────────────────────────

    def load_session(self, filename: str) -> list:
        return self.load_session_file(filename)
