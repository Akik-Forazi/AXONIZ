"""
AXONIZ-ZERO · Semantic Long-Term Memory
Works like Claude's memory or OpenClaw's long-term knowledge:
- Stores facts, preferences, context automatically
- Semantic search via keyword index (no external deps needed)
- Auto-summarises conversation context
- Tags, timestamps, importance scoring
- Survives across sessions, models, restarts
"""

import json
import os
import re
import time
import math
from typing import Dict, List, Optional, Tuple
from axoniz.core.config import AXONIZ_HOME

MEMORY_PATH  = os.path.join(AXONIZ_HOME, "memory.json")
CONTEXT_PATH = os.path.join(AXONIZ_HOME, "context.json")


def _tokenize(text: str) -> List[str]:
    """Simple word tokenizer for keyword indexing."""
    return re.findall(r"[a-z0-9_\-\.]+", text.lower())


def _tfidf_score(query_tokens: List[str], doc_tokens: List[str], idf: Dict[str, float]) -> float:
    """Lightweight TF-IDF similarity — no numpy needed."""
    if not doc_tokens:
        return 0.0
    tf: Dict[str, float] = {}
    for t in doc_tokens:
        tf[t] = tf.get(t, 0) + 1
    total = len(doc_tokens)
    score = 0.0
    for qt in query_tokens:
        if qt in tf:
            tf_val = tf[qt] / total
            idf_val = idf.get(qt, math.log(10))
            score += tf_val * idf_val
    return score


class SemanticMemory:
    """
    Persistent, searchable long-term memory.
    Each entry has: key, value, tags, importance (0-1), created, accessed, hit_count.
    Supports semantic search via TF-IDF keyword overlap — fast, zero deps.
    """

    def __init__(self, path: str = MEMORY_PATH):
        self.path = path
        self._entries: Dict[str, dict] = {}
        self._idf: Dict[str, float] = {}
        self._load()
        self._rebuild_idf()

    # ── Persistence ──────────────────────────────────────────────────────────

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        # Detect old flat format and migrate
                        if data and not isinstance(next(iter(data.values())), dict):
                            self._entries = {
                                k: self._make_entry(k, str(v))
                                for k, v in data.items()
                            }
                        else:
                            self._entries = data
            except Exception:
                self._entries = {}

    def _persist(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self._entries, f, indent=2, ensure_ascii=False)

    def _make_entry(self, key: str, value: str, tags: List[str] = None,
                    importance: float = 0.5) -> dict:
        now = time.time()
        return {
            "key":        key,
            "value":      value,
            "tags":       tags or self._auto_tag(key, value),
            "importance": importance,
            "created":    now,
            "accessed":   now,
            "hit_count":  0,
            "tokens":     _tokenize(f"{key} {value}"),
        }

    def _auto_tag(self, key: str, value: str) -> List[str]:
        """Heuristically tag entries."""
        tags = []
        combined = f"{key} {value}".lower()
        tag_map = {
            "preference": ["prefer", "like", "want", "favorite", "love"],
            "project":    ["project", "repo", "codebase", "app", "api"],
            "person":     ["name", "user", "i am", "my name", "call me"],
            "technical":  ["python", "javascript", "code", "function", "class", "api", "database"],
            "task":       ["todo", "task", "need to", "should", "must", "build"],
        }
        for tag, keywords in tag_map.items():
            if any(kw in combined for kw in keywords):
                tags.append(tag)
        return tags or ["general"]

    def _rebuild_idf(self):
        """Rebuild IDF scores from current corpus."""
        N = max(len(self._entries), 1)
        df: Dict[str, int] = {}
        for entry in self._entries.values():
            seen = set(entry.get("tokens", []))
            for t in seen:
                df[t] = df.get(t, 0) + 1
        self._idf = {t: math.log(N / (1 + c)) for t, c in df.items()}

    # ── Core CRUD ────────────────────────────────────────────────────────────

    def save(self, key: str, value: str, tags: List[str] = None,
             importance: float = 0.5) -> str:
        if key in self._entries:
            # Update existing
            self._entries[key]["value"]      = value
            self._entries[key]["accessed"]   = time.time()
            self._entries[key]["tokens"]     = _tokenize(f"{key} {value}")
            self._entries[key]["importance"] = max(self._entries[key]["importance"], importance)
            if tags:
                self._entries[key]["tags"] = list(set(self._entries[key]["tags"] + tags))
        else:
            self._entries[key] = self._make_entry(key, value, tags, importance)
        self._persist()
        self._rebuild_idf()
        return f"Saved to memory: '{key}'"

    def get(self, key: str) -> str:
        if key in self._entries:
            entry = self._entries[key]
            entry["accessed"]  = time.time()
            entry["hit_count"] = entry.get("hit_count", 0) + 1
            self._persist()
            return entry["value"]
        return f"'{key}' not found in memory."

    def delete(self, key: str) -> str:
        if key in self._entries:
            del self._entries[key]
            self._persist()
            self._rebuild_idf()
            return f"Deleted '{key}' from memory."
        return f"'{key}' not found."

    def clear(self):
        self._entries = {}
        self._persist()

    def all(self) -> Dict[str, str]:
        """Flat dict for backward compat."""
        return {k: v["value"] for k, v in self._entries.items()}

    def all_rich(self) -> Dict[str, dict]:
        return dict(self._entries)

    def list_keys(self) -> str:
        if not self._entries:
            return "Memory is empty."
        lines = ["Stored memory:"]
        for k, v in sorted(self._entries.items(),
                            key=lambda x: x[1].get("importance", 0), reverse=True):
            lines.append(f"  [{', '.join(v.get('tags', []))}] {k}: {v['value'][:80]}")
        return "\n".join(lines)

    # ── Semantic search ───────────────────────────────────────────────────────

    def search(self, query: str, top_k: int = 5) -> List[Tuple[str, str, float]]:
        """
        Return top-k most relevant memories for the query.
        Returns list of (key, value, score).
        """
        if not self._entries:
            return []
        q_tokens = _tokenize(query)
        scored = []
        for key, entry in self._entries.items():
            doc_tokens = entry.get("tokens", _tokenize(f"{key} {entry['value']}"))
            score = _tfidf_score(q_tokens, doc_tokens, self._idf)
            # Boost by importance and recency
            importance_boost = entry.get("importance", 0.5)
            age_days = (time.time() - entry.get("accessed", time.time())) / 86400
            recency_boost = 1.0 / (1.0 + age_days * 0.1)
            final_score = score * (1 + importance_boost) * recency_boost
            if final_score > 0:
                scored.append((key, entry["value"], final_score))
        scored.sort(key=lambda x: x[2], reverse=True)
        return scored[:top_k]

    def get_relevant_context(self, query: str, max_tokens: int = 800) -> str:
        """
        Build a context block with the most relevant memories.
        Used to inject into the system prompt automatically.
        """
        results = self.search(query, top_k=8)
        if not results:
            return ""
        lines = ["[RELEVANT MEMORY]"]
        char_count = 0
        for key, value, score in results:
            line = f"  {key}: {value}"
            if char_count + len(line) > max_tokens:
                break
            lines.append(line)
            char_count += len(line)
        return "\n".join(lines)

    def auto_extract_and_save(self, text: str, source: str = "conversation"):
        """
        Automatically extract and save facts from text.
        Looks for patterns like "I am X", "my X is Y", "remember that X".
        """
        patterns = [
            (r"(?:i am|i'm|my name is)\s+([a-z][a-z\s]{1,30})", "user_name", 0.9),
            (r"(?:i prefer|i like|i use|i work with)\s+([a-z][a-z\s\+\#\.]{1,40})", "user_preference", 0.7),
            (r"(?:my project is|working on|building)\s+([a-z][a-z\s\-\_]{1,40})", "current_project", 0.8),
            (r"(?:remember that|note that|important:)\s+(.{10,120})", "note", 0.8),
            (r"(?:i work at|i'm at|company is)\s+([a-z][a-z\s\-]{1,40})", "workplace", 0.7),
        ]
        text_lower = text.lower()
        for pattern, tag, importance in patterns:
            for m in re.finditer(pattern, text_lower):
                val = m.group(1).strip().rstrip(".,;")
                if len(val) > 2:
                    key = f"auto_{tag}_{int(time.time())}"
                    # Deduplicate — don't save if very similar already exists
                    existing = self.search(val, top_k=1)
                    if not existing or existing[0][2] < 0.5:
                        self.save(key, val, tags=[tag, "auto", source], importance=importance)


# Alias so agent.py import works
Memory = SemanticMemory


class ConversationContext:

    MAX_FULL_TURNS = 20   # Keep this many turns verbatim
    MAX_SUMMARY_CHARS = 2000

    def __init__(self, path: str = CONTEXT_PATH):
        self.path = path
        self._turns: List[dict] = []
        self._summary: str = ""
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._turns   = data.get("turns", [])
                    self._summary = data.get("summary", "")
            except Exception:
                pass

    def _persist(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"turns": self._turns, "summary": self._summary},
                      f, ensure_ascii=False)

    def add(self, role: str, content: str):
        self._turns.append({
            "role":    role,
            "content": content,
            "ts":      time.time(),
        })
        # Compress old turns if needed
        if len(self._turns) > self.MAX_FULL_TURNS * 2:
            self._compress()
        self._persist()

    def _compress(self):
        """Move oldest half to summary."""
        cutoff = len(self._turns) - self.MAX_FULL_TURNS
        old    = self._turns[:cutoff]
        self._turns = self._turns[cutoff:]
        # Simple extractive summary
        user_msgs = [t["content"][:200] for t in old if t["role"] == "user"]
        summary_parts = []
        if self._summary:
            summary_parts.append(self._summary)
        if user_msgs:
            summary_parts.append("Earlier topics: " + "; ".join(user_msgs[-5:]))
        self._summary = " | ".join(summary_parts)[-self.MAX_SUMMARY_CHARS:]

    def get_messages(self) -> List[dict]:
        """Return conversation as OpenAI message list (no timestamps)."""
        msgs = []
        if self._summary:
            msgs.append({
                "role":    "system",
                "content": f"[CONVERSATION SUMMARY]\n{self._summary}",
            })
        for t in self._turns[-self.MAX_FULL_TURNS:]:
            msgs.append({"role": t["role"], "content": t["content"]})
        return msgs

    def clear(self):
        self._turns   = []
        self._summary = ""
        self._persist()

    def get_recent(self, n: int = 5) -> List[dict]:
        return self._turns[-n:]
