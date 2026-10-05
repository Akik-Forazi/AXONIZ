"""
AXONIZ-ZERO · Chat Store
Saves every conversation as a proper JSON file in ~/.axoniz/chats/
Format mirrors how ChatGPT stores conversations — each chat is one file:

  ~/.axoniz/chats/<id>.json
  {
    "id":       "chat_20260412_143022_a1b2c3",
    "title":    "Build a FastAPI REST API",
    "model":    "qwen2.5-7b-instruct",
    "created":  "2026-04-12T14:30:22",
    "updated":  "2026-04-12T14:35:07",
    "mode":     "agent",
    "messages": [
      {"role": "user",      "content": "...", "ts": "2026-04-12T14:30:22"},
      {"role": "assistant", "content": "...", "ts": "2026-04-12T14:30:45",
       "tool_calls": [...], "steps": 3},
    ]
  }

Index file for fast listing:
  ~/.axoniz/chats/index.json  — array of {id, title, model, created, updated, msg_count}
"""

import json
import os
import random
import string
import time
import threading
from datetime import datetime
from typing import List, Optional

from axoniz.core.config import AXONIZ_HOME

CHATS_DIR  = os.path.join(AXONIZ_HOME, "chats")
INDEX_PATH = os.path.join(CHATS_DIR,   "index.json")

os.makedirs(CHATS_DIR, exist_ok=True)


def _rand(n=6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _chat_path(chat_id: str) -> str:
    return os.path.join(CHATS_DIR, f"{chat_id}.json")


# ── Index helpers ──────────────────────────────────────────────────────────────

def _load_index() -> List[dict]:
    try:
        with open(INDEX_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_index(index: List[dict]):
    try:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _upsert_index(entry: dict):
    """Insert or update a chat in the index, keeping it sorted newest-first."""
    index = _load_index()
    index = [e for e in index if e.get("id") != entry["id"]]
    index.insert(0, entry)
    _save_index(index[:500])  # cap at 500 entries


def _remove_from_index(chat_id: str):
    index = _load_index()
    index = [e for e in index if e.get("id") != chat_id]
    _save_index(index)


# ── Chat file CRUD ─────────────────────────────────────────────────────────────

def create_chat(title: str = "", model: str = "", mode: str = "chat") -> dict:
    """Create a new empty chat and persist it. Returns the chat dict."""
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = _rand(6)
    chat_id = f"chat_{ts}_{uid}"
    now = _now_iso()
    chat = {
        "id":        chat_id,
        "title":     title or "New conversation",
        "model":     model,
        "created":   now,
        "updated":   now,
        "mode":      mode,
        "messages":  [],
        "pinned":    False,
    }
    _write_chat(chat)
    _upsert_index({
        "id":        chat_id,
        "title":     chat["title"],
        "model":     model,
        "created":   now,
        "updated":   now,
        "mode":      mode,
        "msg_count": 0,
        "pinned":    False,
    })
    return chat


def load_chat(chat_id: str) -> Optional[dict]:
    """Load a chat by id. Returns None if not found."""
    try:
        with open(_chat_path(chat_id), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def save_chat(chat: dict):
    """Write the full chat dict to disk and update the index."""
    chat["updated"] = _now_iso()
    _write_chat(chat)
    _upsert_index({
        "id":        chat["id"],
        "title":     chat.get("title", ""),
        "model":     chat.get("model", ""),
        "created":   chat.get("created", ""),
        "updated":   chat["updated"],
        "mode":      chat.get("mode", "chat"),
        "msg_count": len(chat.get("messages", [])),
        "pinned":    chat.get("pinned", False),
    })


def _write_chat(chat: dict):
    try:
        with open(_chat_path(chat["id"]), "w", encoding="utf-8") as f:
            json.dump(chat, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def append_message(chat_id: str, role: str, content: str,
                   tool_calls: list = None, steps: int = 0,
                   model: str = "") -> Optional[dict]:
    """
    Append one message to an existing chat and save.
    Returns the updated chat or None if not found.
    """
    chat = load_chat(chat_id)
    if chat is None:
        return None
    msg = {
        "role":    role,
        "content": content,
        "ts":      _now_iso(),
    }
    if tool_calls:
        msg["tool_calls"] = tool_calls
    if steps:
        msg["steps"] = steps
    if model and not chat.get("model"):
        chat["model"] = model
    chat["messages"].append(msg)
    # Auto-title from first user message
    if role == "user" and (not chat.get("title") or chat["title"] == "New conversation"):
        chat["title"] = content[:72].rstrip() + ("…" if len(content) > 72 else "")
    save_chat(chat)
    return chat


def delete_chat(chat_id: str) -> bool:
    """Delete chat file and remove from index."""
    try:
        path = _chat_path(chat_id)
        if os.path.exists(path):
            os.remove(path)
        _remove_from_index(chat_id)
        return True
    except Exception:
        return False


def rename_chat(chat_id: str, new_title: str) -> bool:
    chat = load_chat(chat_id)
    if chat is None:
        return False
    chat["title"] = new_title[:120]
    save_chat(chat)
    return True


def pin_chat(chat_id: str, pinned: bool = True) -> bool:
    chat = load_chat(chat_id)
    if chat is None:
        return False
    chat["pinned"] = pinned
    save_chat(chat)
    return True


def clear_all_chats() -> int:
    """Delete every chat file. Returns count deleted."""
    count = 0
    try:
        for fname in os.listdir(CHATS_DIR):
            if fname.endswith(".json") and fname != "index.json":
                try:
                    os.remove(os.path.join(CHATS_DIR, fname))
                    count += 1
                except Exception:
                    pass
        _save_index([])
    except Exception:
        pass
    return count


def list_chats(limit: int = 100, offset: int = 0) -> List[dict]:
    """Return index entries, newest first. Pinned chats first."""
    index = _load_index()
    # Pinned first, then by updated desc
    pinned   = [e for e in index if e.get("pinned")]
    unpinned = [e for e in index if not e.get("pinned")]
    combined = pinned + unpinned
    return combined[offset : offset + limit]


def search_chats(query: str, limit: int = 20) -> List[dict]:
    """
    Simple full-text search across chat titles and message content.
    Searches index titles first (fast), then scans files for query in messages.
    """
    q = query.lower().strip()
    if not q:
        return list_chats(limit)

    results = []
    index   = _load_index()

    for entry in index:
        if q in entry.get("title", "").lower():
            results.append({**entry, "_match": "title"})

    # Also scan message content for top 50 chats if not enough title matches
    if len(results) < limit:
        scanned = 0
        for entry in index:
            if scanned >= 50:
                break
            if any(r["id"] == entry["id"] for r in results):
                scanned += 1
                continue
            chat = load_chat(entry["id"])
            if chat:
                for msg in chat.get("messages", []):
                    if q in msg.get("content", "").lower():
                        results.append({**entry, "_match": "content"})
                        break
            scanned += 1

    return results[:limit]


def export_chat_markdown(chat_id: str) -> str:
    """Export a chat as a Markdown string."""
    chat = load_chat(chat_id)
    if not chat:
        return ""
    lines = [
        f"# {chat.get('title', 'Chat Export')}\n",
        f"**Model:** {chat.get('model', '—')}  \n",
        f"**Date:** {chat.get('created', '—')}  \n",
        f"**Mode:** {chat.get('mode', 'chat')}  \n\n",
        "---\n\n",
    ]
    for msg in chat.get("messages", []):
        role = msg.get("role", "")
        content = msg.get("content", "")
        ts = msg.get("ts", "")
        if role == "user":
            lines.append(f"### You  \n*{ts}*\n\n{content}\n\n---\n\n")
        elif role == "assistant":
            tc = msg.get("tool_calls", [])
            steps = msg.get("steps", 0)
            header = "### axoniz"
            if steps:
                header += f"  *(agent · {steps} steps · {len(tc)} tool calls)*"
            lines.append(f"{header}  \n*{ts}*\n\n{content}\n\n---\n\n")
    return "".join(lines)


# ── Background auto-save writer ────────────────────────────────────────────────

class AsyncChatWriter:
    """
    Thread-safe background writer.
    Batches rapid consecutive saves and flushes every 0.5 s max.
    This gives the feel of instant saving with no blocking on the main thread.
    """

    def __init__(self):
        self._pending: dict = {}   # chat_id -> chat dict
        self._lock    = threading.Lock()
        self._event   = threading.Event()
        self._thread  = threading.Thread(target=self._loop, daemon=True, name="chat-writer")
        self._thread.start()

    def queue(self, chat: dict):
        """Queue a chat for background write. Non-blocking."""
        with self._lock:
            self._pending[chat["id"]] = chat
        self._event.set()

    def _loop(self):
        while True:
            self._event.wait(timeout=0.5)
            self._event.clear()
            with self._lock:
                pending = dict(self._pending)
                self._pending.clear()
            for chat in pending.values():
                try:
                    save_chat(chat)
                except Exception:
                    pass


# Module-level singleton writer
_writer = AsyncChatWriter()


def queue_save(chat: dict):
    """Queue a chat for async background save. Use this from the server."""
    _writer.queue(chat)
