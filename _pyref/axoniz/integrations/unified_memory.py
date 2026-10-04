"""
axoniz/integrations/unified_memory.py
======================================
Merges Hermes MemoryManager + MemPalace palace + axoniz SemanticMemory
into one object used directly by axoniz.core.agent.Agent.

NO new abstractions — uses the original code from:
  axoniz/mempalace/mempalace/knowledge_graph.py  → KnowledgeGraph
  axoniz/mempalace/mempalace/palace.py            → get_collection
  axoniz/mempalace/mempalace/searcher.py          → search_memories
  axoniz/mempalace/mempalace/palace_graph.py      → traverse, find_tunnels, graph_stats
  axoniz/hermes-agent/agent/memory_manager.py    → MemoryManager pattern (context fencing)
  axoniz/core/memory.py                           → SemanticMemory (always-on fallback)

The Agent just does:
    from axoniz.integrations.unified_memory import UnifiedMemory
    self.memory = UnifiedMemory(config)

And gets all memory_save/get/list tools PLUS palace/kg/diary tools wired in.
"""

import hashlib
import json
import logging
import os
import re
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from axoniz.core.config import AXONIZ_HOME
from axoniz.core.memory import SemanticMemory   # built-in TF-IDF, always-on

logger = logging.getLogger("axoniz.unified_memory")

# ── Paths shared across sub-systems ──────────────────────────────────────────
PALACE_PATH = os.path.join(AXONIZ_HOME, "palace")
KG_PATH     = os.path.join(AXONIZ_HOME, "knowledge_graph.sqlite3")
WAL_DIR     = Path(AXONIZ_HOME) / "wal"

os.makedirs(PALACE_PATH, exist_ok=True)
WAL_DIR.mkdir(parents=True, exist_ok=True)

COLLECTION_NAME = "mempalace_drawers"

# ── context fencing (from hermes memory_manager.py) ──────────────────────────
_FENCE_TAG_RE = re.compile(r'</?\s*memory-context\s*>', re.IGNORECASE)

def _sanitize_context(text: str) -> str:
    return _FENCE_TAG_RE.sub('', text)

def _build_memory_context_block(raw: str) -> str:
    """Wrap recalled memory in a fenced block — prevents model treating it as user input."""
    if not raw or not raw.strip():
        return ""
    clean = _sanitize_context(raw)
    return (
        "<memory-context>\n"
        "[System note: recalled memory context — NOT new user input. Treat as background.]\n\n"
        f"{clean}\n"
        "</memory-context>"
    )


# ════════════════════════════════════════════════════════════════════════════
# PalaceLayer — thin wrapper over mempalace's get_collection + search_memories
# Uses the ORIGINAL mempalace code, not a rewrite.
# ════════════════════════════════════════════════════════════════════════════

class PalaceLayer:
    """
    Uses mempalace.palace.get_collection and mempalace.searcher.search_memories
    directly — no duplication.
    """

    def __init__(self, palace_path: str = PALACE_PATH):
        self.palace_path = palace_path
        self._available: Optional[bool] = None
        self._col_lock = threading.Lock()
        self._col = None
        self._wal = WAL_DIR / "palace_writes.jsonl"
        if not self._wal.exists():
            self._wal.touch(mode=0o600)

    def is_available(self) -> bool:
        if self._available is None:
            try:
                import chromadb  # noqa
                self._available = True
            except ImportError:
                self._available = False
                logger.warning("[Palace] chromadb not installed — palace disabled. pip install chromadb")
        return self._available

    def _get_col(self, create: bool = True):
        if not self.is_available():
            return None
        # Use mempalace's own get_collection
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mempalace'))
            from mempalace.palace import get_collection
            return get_collection(self.palace_path, collection_name=COLLECTION_NAME, create=create)
        except Exception as e:
            logger.debug(f"[Palace] _get_col failed: {e}")
            return None

    def _wal_log(self, op: str, info: dict):
        entry = {"ts": datetime.now().isoformat(), "op": op, **info}
        try:
            with open(self._wal, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str) + "\n")
        except Exception:
            pass

    # ── Read ─────────────────────────────────────────────────────────────────

    def search(self, query: str, wing: str = None, room: str = None,
               limit: int = 5, max_distance: float = 1.5) -> dict:
        if not self.is_available():
            return {"results": [], "error": "chromadb not installed"}
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mempalace'))
            from mempalace.searcher import search_memories
            return search_memories(
                query, palace_path=self.palace_path,
                wing=wing, room=room,
                n_results=limit, max_distance=max_distance,
            )
        except Exception as e:
            return {"results": [], "error": str(e)}

    def status(self) -> dict:
        col = self._get_col(create=False)
        if not col:
            return {"error": "Palace not initialized", "total_drawers": 0, "wings": {}}
        try:
            count = col.count()
            wings: Dict[str, int] = {}
            if count > 0:
                all_meta = col.get(include=["metadatas"]).get("metadatas", [])
                for m in all_meta:
                    w = m.get("wing", "unknown")
                    wings[w] = wings.get(w, 0) + 1
            return {"total_drawers": count, "wings": wings, "palace_path": self.palace_path}
        except Exception as e:
            return {"error": str(e), "total_drawers": 0, "wings": {}}

    def list_wings(self) -> dict:
        st = self.status()
        return {"wings": st.get("wings", {})}

    def list_rooms(self, wing: str = None) -> dict:
        col = self._get_col(create=False)
        if not col:
            return {"rooms": {}}
        try:
            kwargs = {"include": ["metadatas"]}
            if wing:
                kwargs["where"] = {"wing": wing}
            all_meta = col.get(**kwargs).get("metadatas", [])
            rooms: Dict[str, int] = {}
            for m in all_meta:
                r = m.get("room", "unknown")
                rooms[r] = rooms.get(r, 0) + 1
            return {"wing": wing or "all", "rooms": rooms}
        except Exception as e:
            return {"rooms": {}, "error": str(e)}

    def get_context(self) -> str:
        st = self.status()
        if "error" in st and st["total_drawers"] == 0:
            return ""
        wing_str = ", ".join(f"{w}({c})" for w, c in list(st.get("wings", {}).items())[:6])
        return f"Palace: {st['total_drawers']} drawers | Wings: {wing_str}"

    def traverse_graph(self, start_room: str, max_hops: int = 2) -> Any:
        if not self.is_available():
            return {"error": "Palace unavailable"}
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mempalace'))
            from mempalace.palace_graph import traverse
            col = self._get_col(create=False)
            return traverse(start_room, col=col, max_hops=max_hops)
        except Exception as e:
            return {"error": str(e)}

    def find_tunnels(self, wing_a: str = None, wing_b: str = None) -> Any:
        if not self.is_available():
            return {"error": "Palace unavailable"}
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mempalace'))
            from mempalace.palace_graph import find_tunnels
            col = self._get_col(create=False)
            return find_tunnels(wing_a, wing_b, col=col)
        except Exception as e:
            return {"error": str(e)}

    def graph_stats(self) -> dict:
        if not self.is_available():
            return {"error": "Palace unavailable"}
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mempalace'))
            from mempalace.palace_graph import graph_stats
            col = self._get_col(create=False)
            return graph_stats(col=col)
        except Exception as e:
            return {"error": str(e)}

    def check_duplicate(self, content: str, threshold: float = 0.9) -> dict:
        col = self._get_col(create=False)
        if not col:
            return {"is_duplicate": False}
        try:
            results = col.query(
                query_texts=[content], n_results=3,
                include=["metadatas", "documents", "distances"],
            )
            dups = []
            for i, did in enumerate(results.get("ids", [[]])[0]):
                sim = round(1 - results["distances"][0][i], 3)
                if sim >= threshold:
                    dups.append({"id": did, "similarity": sim,
                                 "content": results["documents"][0][i][:200]})
            return {"is_duplicate": len(dups) > 0, "matches": dups}
        except Exception as e:
            return {"is_duplicate": False, "error": str(e)}

    # ── Write ─────────────────────────────────────────────────────────────────

    def store(self, wing: str, room: str, content: str, added_by: str = "axoniz") -> dict:
        if not self.is_available():
            return {"success": False, "error": "chromadb not installed"}
        col = self._get_col(create=True)
        if not col:
            return {"success": False, "error": "Palace collection unavailable"}

        wing = re.sub(r"[^a-z0-9_\-]", "-", wing.lower())[:40]
        room = re.sub(r"[^a-z0-9_\-]", "-", room.lower())[:40]
        drawer_id = "drawer_{}_{}_{}" .format(
            wing, room,
            hashlib.sha256((wing + room + content[:100]).encode()).hexdigest()[:20]
        )
        self._wal_log("store", {"wing": wing, "room": room, "id": drawer_id, "added_by": added_by})
        try:
            existing = col.get(ids=[drawer_id])
            if existing and existing["ids"]:
                return {"success": True, "reason": "already_exists", "id": drawer_id}
        except Exception:
            pass
        try:
            col.upsert(
                ids=[drawer_id],
                documents=[content],
                metadatas=[{
                    "wing": wing, "room": room,
                    "added_by": added_by,
                    "filed_at": datetime.now().isoformat(),
                }],
            )
            return {"success": True, "id": drawer_id, "wing": wing, "room": room}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete(self, drawer_id: str) -> dict:
        col = self._get_col(create=False)
        if not col:
            return {"success": False, "error": "Palace unavailable"}
        try:
            self._wal_log("delete", {"id": drawer_id})
            col.delete(ids=[drawer_id])
            return {"success": True, "id": drawer_id}
        except Exception as e:
            return {"success": False, "error": str(e)}


# ════════════════════════════════════════════════════════════════════════════
# KnowledgeGraphLayer — uses original mempalace KnowledgeGraph directly
# ════════════════════════════════════════════════════════════════════════════

class KnowledgeGraphLayer:
    """
    Wraps the original mempalace KnowledgeGraph stored at AXONIZ_HOME.
    """
    def __init__(self, kg_path: str = KG_PATH):
        self._kg_path = kg_path
        self._kg: Optional[Any] = None

    def _get(self):
        if self._kg is None:
            try:
                sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mempalace'))
                from mempalace.knowledge_graph import KnowledgeGraph
                self._kg = KnowledgeGraph(db_path=self._kg_path)
            except ImportError:
                # Fall back to a minimal local implementation
                self._kg = _MinimalKG(self._kg_path)
        return self._kg

    def add(self, subject: str, predicate: str, obj: str,
            valid_from: str = None, source: str = None) -> str:
        try:
            return self._get().add_triple(
                subject, predicate, obj, valid_from=valid_from, source_closet=source
            )
        except Exception as e:
            return f"[KG error] {e}"

    def query(self, entity: str, as_of: str = None, direction: str = "both") -> List[dict]:
        try:
            return self._get().query_entity(entity, as_of=as_of, direction=direction)
        except Exception as e:
            return [{"error": str(e)}]

    def invalidate(self, subject: str, predicate: str, obj: str, ended: str = None):
        try:
            self._get().invalidate(subject, predicate, obj, ended=ended)
        except Exception:
            pass

    def timeline(self, entity: str = None) -> List[dict]:
        try:
            return self._get().timeline(entity_name=entity)
        except Exception as e:
            return [{"error": str(e)}]

    def stats(self) -> dict:
        try:
            return self._get().stats()
        except Exception as e:
            return {"error": str(e)}


class _MinimalKG:
    """Fallback KG using only stdlib sqlite3 when mempalace import fails."""
    import sqlite3 as _sqlite3

    def __init__(self, db_path: str):
        import sqlite3
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("""CREATE TABLE IF NOT EXISTS triples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT, predicate TEXT, object TEXT,
            valid_from TEXT, valid_until TEXT, source TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_s ON triples(subject)")
        self._conn.commit()

    def add_triple(self, subject, predicate, obj,
                   valid_from=None, source_closet=None, **kw):
        cur = self._conn.execute(
            "INSERT INTO triples(subject,predicate,object,valid_from,source) VALUES(?,?,?,?,?)",
            (subject, predicate, obj, valid_from, source_closet)
        )
        self._conn.commit()
        return str(cur.lastrowid)

    def query_entity(self, name, as_of=None, direction="both"):
        rows = []
        if direction in ("outgoing", "both"):
            rows += [dict(zip(["subject","predicate","object","valid_from","valid_to","current"], r))
                     for r in self._conn.execute(
                "SELECT subject,predicate,object,valid_from,valid_until,CASE WHEN valid_until IS NULL THEN 1 ELSE 0 END FROM triples WHERE subject=?", (name,)
            ).fetchall()]
        if direction in ("incoming", "both"):
            rows += [dict(zip(["subject","predicate","object","valid_from","valid_to","current"], r))
                     for r in self._conn.execute(
                "SELECT subject,predicate,object,valid_from,valid_until,CASE WHEN valid_until IS NULL THEN 1 ELSE 0 END FROM triples WHERE object=?", (name,)
            ).fetchall()]
        return rows

    def invalidate(self, subject, predicate, obj, ended=None):
        ended = ended or datetime.now().strftime("%Y-%m-%d")
        self._conn.execute(
            "UPDATE triples SET valid_until=? WHERE subject=? AND predicate=? AND object=? AND valid_until IS NULL",
            (ended, subject, predicate, obj)
        )
        self._conn.commit()

    def timeline(self, entity_name=None):
        if entity_name:
            rows = self._conn.execute(
                "SELECT subject,predicate,object,valid_from,valid_until FROM triples WHERE subject=? OR object=? ORDER BY created_at",
                (entity_name, entity_name)
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT subject,predicate,object,valid_from,valid_until FROM triples ORDER BY created_at"
            ).fetchall()
        return [{"subject":r[0],"predicate":r[1],"object":r[2],"valid_from":r[3],"valid_to":r[4]} for r in rows]

    def stats(self):
        total  = self._conn.execute("SELECT COUNT(*) FROM triples").fetchone()[0]
        active = self._conn.execute("SELECT COUNT(*) FROM triples WHERE valid_until IS NULL").fetchone()[0]
        return {"total_triples": total, "active_triples": active}


# ════════════════════════════════════════════════════════════════════════════
# AgentDiary — AAAK diary stored in the palace
# ════════════════════════════════════════════════════════════════════════════

class AgentDiary:
    """
    Agent's personal journal stored in the palace.
    Each agent gets wing_<name>/diary.
    Supports AAAK-compressed entries (same format as MemPalace).
    """
    AAAK_SPEC = (
        "AAAK: compressed memory dialect. "
        "ENTITIES: 3-letter codes. EMOTIONS: *warm* *fierce* *raw* *bloom*. "
        "STRUCTURE: SESSION:DATE|TOPIC:tag|entry. ★ to ★★★★★. "
        "HALLS: hall_facts hall_events hall_decisions hall_diary. "
        "WINGS: wing_user wing_agent wing_code wing_project. "
        "ROOMS: hyphenated-slugs."
    )

    def __init__(self, palace: PalaceLayer, agent_name: str = "axoniz-zero"):
        self.palace = palace
        self.agent_name = re.sub(r"[^a-z0-9_]", "_", agent_name.lower())
        self._wing = f"wing_{self.agent_name}"
        self._room = "diary"

    def write(self, entry: str, topic: str = "general") -> dict:
        now = datetime.now().strftime("%Y-%m-%d")
        content = f"SESSION:{now}|TOPIC:{topic}|{entry}"
        return self.palace.store(
            wing=self._wing, room=self._room,
            content=content, added_by=self.agent_name
        )

    def read(self, last_n: int = 10) -> dict:
        return self.palace.search(
            query="SESSION TOPIC diary",
            wing=self._wing, room=self._room, limit=last_n
        )


# ════════════════════════════════════════════════════════════════════════════
# UnifiedMemory — the single object Agent uses
# ════════════════════════════════════════════════════════════════════════════

class UnifiedMemory:
    """
    Drop-in replacement for axoniz.core.memory.SemanticMemory used by Agent.

    Combines:
      1. SemanticMemory      — TF-IDF, always-on, no deps (from axoniz.core.memory)
      2. PalaceLayer         — ChromaDB semantic palace (optional, needs chromadb)
      3. KnowledgeGraphLayer — temporal KG (sqlite, from mempalace.knowledge_graph)
      4. AgentDiary          — AAAK journal stored in palace

    Hermes MemoryManager patterns used:
      - context fencing (_build_memory_context_block)
      - prefetch/sync_turn lifecycle
      - single provider limit enforced (palace replaces mempalace_bridge, not added to it)

    Agent accesses it via self.memory — all old calls (save/get/list/search/all)
    still work. New palace/kg tools are injected into agent._tool_map via as_tool_map().
    """

    def __init__(self, config: dict = None):
        config = config or {}
        agent_name = config.get("agent_name", "axoniz-zero")
        palace_path = config.get("palace_path", PALACE_PATH)
        kg_path     = config.get("kg_path",     KG_PATH)

        # 1. Always-on local memory (TF-IDF, zero deps)
        from axoniz.core.config import MEMORY_PATH
        self.builtin = SemanticMemory(MEMORY_PATH)

        # 2. Palace (chromadb, optional)
        self.palace  = PalaceLayer(palace_path)

        # 3. Knowledge graph
        self.kg      = KnowledgeGraphLayer(kg_path)

        # 4. Diary
        self.diary   = AgentDiary(self.palace, agent_name)

        # Hermes: prefetch cache for next turn
        self._prefetch_cache: str = ""
        self._prefetch_lock = threading.Lock()

        logger.info("[UnifiedMemory] ready | palace=%s | kg=%s | palace_enabled=%s",
                    palace_path, kg_path, self.palace.is_available())

    # ── SemanticMemory drop-in interface ─────────────────────────────────────
    # These are the methods axoniz.core.agent calls on self.memory

    def save(self, key: str, value: str, tags: List[str] = None,
             importance: float = 0.5) -> str:
        result = self.builtin.save(key, value, tags, importance)
        if self.palace.is_available():
            wing = tags[0] if tags else "general"
            self.palace.store(wing=wing, room="memory",
                              content=f"{key}: {value}", added_by="axoniz")
        return result

    def get(self, key: str) -> str:
        local = self.builtin.get(key)
        if "not found in memory." not in local:
            return local
        if self.palace.is_available():
            r = self.palace.search(key, limit=1)
            items = r.get("results", [])
            if items:
                return items[0]["text"]
        return local

    def delete(self, key: str) -> str:
        return self.builtin.delete(key)

    def clear(self):
        self.builtin.clear()

    def all(self) -> Dict[str, str]:
        return self.builtin.all()

    def all_rich(self) -> Dict[str, dict]:
        return self.builtin.all_rich()

    def list_keys(self) -> str:
        local = self.builtin.list_keys()
        if self.palace.is_available():
            wings = self.palace.list_wings().get("wings", {})
            if wings:
                wing_str = ", ".join(f"{w}({c})" for w, c in wings.items())
                return f"{local}\n\n[Palace wings]: {wing_str}"
        return local

    def search(self, query: str, top_k: int = 5) -> List[Tuple[str, str, float]]:
        return self.builtin.search(query, top_k)

    def get_relevant_context(self, query: str, max_tokens: int = 800) -> str:
        """
        Build context block injected into system prompt.
        Hermes pattern: fenced block, prefetch from palace.
        """
        parts = []

        # Prefetch cache from previous turn (Hermes pattern)
        with self._prefetch_lock:
            cached = self._prefetch_cache

        if cached:
            parts.append(cached)
        elif self.palace.is_available():
            # Live fetch if no cache yet
            ctx = self.palace.get_context()
            if ctx:
                parts.append(ctx)
            r = self.palace.search(query, limit=3)
            hits = r.get("results", [])
            if hits:
                lines = ["[PALACE SEARCH]"]
                for h in hits:
                    lines.append(f"  [{h['wing']}/{h['room']}] {h['text'][:200]}")
                parts.append("\n".join(lines))

        # Always include TF-IDF local memory too
        local_ctx = self.builtin.get_relevant_context(query, max_tokens // 2)
        if local_ctx:
            parts.append(local_ctx)

        if not parts:
            return ""

        combined = "\n\n".join(parts)
        return _build_memory_context_block(combined)

    def auto_extract_and_save(self, text: str, source: str = "conversation"):
        self.builtin.auto_extract_and_save(text, source)
        if self.palace.is_available() and len(text) > 50:
            self.palace.store(wing="wing_axoniz", room="conversations",
                              content=text[:600], added_by="auto")

    # ── Hermes lifecycle hooks ────────────────────────────────────────────────

    def prefetch(self, query: str):
        """Called before each agent turn — background-caches palace context."""
        if not self.palace.is_available():
            return
        def _do():
            parts = []
            ctx = self.palace.get_context()
            if ctx:
                parts.append(ctx)
            r = self.palace.search(query, limit=4)
            hits = r.get("results", [])
            if hits:
                lines = ["[PALACE]"]
                for h in hits:
                    lines.append(f"  [{h['wing']}/{h['room']}] {h['text'][:150]}")
                parts.append("\n".join(lines))
            with self._prefetch_lock:
                self._prefetch_cache = "\n\n".join(parts)
        threading.Thread(target=_do, daemon=True).start()

    def sync_turn(self, user_content: str, assistant_content: str):
        """Called after each turn — save conversation to palace."""
        if self.palace.is_available():
            def _do():
                self.palace.store(
                    wing="wing_axoniz", room="conversation-log",
                    content=f"USR: {user_content[:300]}\nAGT: {assistant_content[:300]}",
                    added_by="sync"
                )
            threading.Thread(target=_do, daemon=True).start()

    # ── Tool map — injected into Agent._tool_map ──────────────────────────────

    def as_tool_map(self) -> Dict[str, Callable]:
        """
        Returns callable tools to merge into agent._tool_map.
        Overrides memory_save/get/list with unified versions.
        Adds palace/kg/diary tools.
        """
        return {
            # ── Override existing axoniz memory tools ──
            "memory_save":  self.save,
            "memory_get":   self.get,
            "memory_list":  self.list_keys,

            # ── Palace read tools ──
            "palace_search":        self._t_palace_search,
            "palace_context":       self._t_palace_context,
            "palace_status":        self._t_palace_status,
            "palace_wings":         self._t_palace_wings,
            "palace_rooms":         self._t_palace_rooms,
            "palace_check_dup":     self._t_palace_check_dup,
            "palace_graph_traverse":self._t_palace_traverse,
            "palace_find_tunnels":  self._t_palace_tunnels,
            "palace_graph_stats":   self._t_palace_graph_stats,

            # ── Palace write tools ──
            "palace_store":  self._t_palace_store,
            "palace_delete": self._t_palace_delete,

            # ── Knowledge graph ──
            "kg_add":       self._t_kg_add,
            "kg_query":     self._t_kg_query,
            "kg_invalidate":self._t_kg_invalidate,
            "kg_timeline":  self._t_kg_timeline,
            "kg_stats":     self._t_kg_stats,

            # ── Agent diary ──
            "diary_write":  self._t_diary_write,
            "diary_read":   self._t_diary_read,
        }

    def as_tool_schemas(self) -> List[dict]:
        """OpenAI-format schemas for all memory tools — used in TOOL_SCHEMAS."""
        return [
            _fn("palace_search",
                "Semantic search across the palace (ChromaDB). Use before answering questions about past decisions, projects, or context. Returns verbatim stored content.",
                {"query": ("string", "Search query"), "wing": ("string", "Wing filter (optional)"),
                 "room": ("string", "Room filter (optional)"), "limit": ("integer", "Max results (default 5)")},
                required=["query"]),
            _fn("palace_store",
                "Save verbatim content into the palace. wing=domain (project/person/topic), room=sub-topic.",
                {"wing": ("string", "Domain (e.g. project name)"), "room": ("string", "Sub-topic"),
                 "content": ("string", "Verbatim content to store")},
                required=["wing", "room", "content"]),
            _fn("palace_context",
                "Load palace wake-up context: total drawers, wings overview. Call at start of session.",
                {}, required=[]),
            _fn("palace_wings",
                "List all palace wings and drawer counts.", {}, required=[]),
            _fn("palace_rooms",
                "List rooms in a wing.",
                {"wing": ("string", "Wing name")}, required=[]),
            _fn("palace_check_dup",
                "Check if content already exists before storing.",
                {"content": ("string", "Content to check"),
                 "threshold": ("number", "Similarity threshold 0-1 (default 0.9)")},
                required=["content"]),
            _fn("palace_delete",
                "Delete a palace drawer by ID.",
                {"drawer_id": ("string", "Drawer ID")}, required=["drawer_id"]),
            _fn("palace_graph_traverse",
                "Walk palace graph from a room — find connected ideas across wings.",
                {"start_room": ("string", "Room to start from"),
                 "max_hops": ("integer", "Hops to follow (default 2)")},
                required=["start_room"]),
            _fn("palace_find_tunnels",
                "Find rooms that bridge two wings.",
                {"wing_a": ("string", "First wing"), "wing_b": ("string", "Second wing")},
                required=[]),
            _fn("palace_graph_stats",
                "Palace graph overview: rooms, tunnels, edges.", {}, required=[]),
            _fn("kg_add",
                "Add a temporal fact: subject → predicate → object. E.g. ('Max','loves','chess',valid_from='2025-01-01')",
                {"subject": ("string", "Entity"), "predicate": ("string", "Relationship"),
                 "obj": ("string", "Connected entity"), "valid_from": ("string", "When true (YYYY-MM-DD)"),
                 "source": ("string", "Source reference")},
                required=["subject", "predicate", "obj"]),
            _fn("kg_query",
                "Query knowledge graph for an entity's facts. direction: outgoing/incoming/both.",
                {"entity": ("string", "Entity name"), "as_of": ("string", "Date filter YYYY-MM-DD"),
                 "direction": ("string", "outgoing/incoming/both")},
                required=["entity"]),
            _fn("kg_invalidate",
                "Mark a fact as no longer true.",
                {"subject": ("string",""), "predicate": ("string",""), "obj": ("string",""),
                 "ended": ("string", "When it ended YYYY-MM-DD")},
                required=["subject", "predicate", "obj"]),
            _fn("kg_timeline",
                "Chronological timeline of facts.",
                {"entity": ("string", "Entity name (optional)")}, required=[]),
            _fn("kg_stats",
                "Knowledge graph statistics.", {}, required=[]),
            _fn("diary_write",
                "Write a diary entry in AAAK format. Your personal journal across sessions.",
                {"entry": ("string", "AAAK-format diary entry"),
                 "topic": ("string", "Topic tag (optional)")},
                required=["entry"]),
            _fn("diary_read",
                "Read your recent diary entries.",
                {"last_n": ("integer", "Number of entries (default 10)")},
                required=[]),
        ]

    # ── Tool implementations ──────────────────────────────────────────────────

    def _t_palace_search(self, query: str, wing: str = None, room: str = None,
                         limit: int = 5) -> str:
        r = self.palace.search(query, wing=wing, room=room, limit=limit)
        if "error" in r and not r.get("results"):
            return f"[Palace error] {r['error']}"
        hits = r.get("results", [])
        if not hits:
            return f"No palace results for: {query}"
        lines = [f"Palace search: '{query}' ({len(hits)} results)"]
        for h in hits:
            lines.append(f"  [{h['wing']}/{h['room']}] sim={h.get('similarity', h.get('distance','?'))} | {h['text'][:200]}")
        return "\n".join(lines)

    def _t_palace_store(self, wing: str, room: str, content: str) -> str:
        r = self.palace.store(wing=wing, room=room, content=content, added_by="agent")
        return json.dumps(r)

    def _t_palace_context(self) -> str:
        st = self.palace.status()
        if "error" in st and st["total_drawers"] == 0:
            return "[Palace empty or unavailable. pip install chromadb to enable.]"
        lines = [
            f"Palace status: {st['total_drawers']} drawers",
            "Wings: " + ", ".join(f"{w}({c})" for w, c in list(st.get("wings", {}).items())[:8]),
        ]
        return "\n".join(lines)

    def _t_palace_status(self) -> str:
        return json.dumps(self.palace.status(), indent=2)

    def _t_palace_wings(self) -> str:
        return json.dumps(self.palace.list_wings(), indent=2)

    def _t_palace_rooms(self, wing: str = None) -> str:
        return json.dumps(self.palace.list_rooms(wing), indent=2)

    def _t_palace_check_dup(self, content: str, threshold: float = 0.9) -> str:
        return json.dumps(self.palace.check_duplicate(content, threshold), indent=2)

    def _t_palace_delete(self, drawer_id: str) -> str:
        return json.dumps(self.palace.delete(drawer_id), indent=2)

    def _t_palace_traverse(self, start_room: str, max_hops: int = 2) -> str:
        return json.dumps(self.palace.traverse_graph(start_room, max_hops), indent=2, default=str)

    def _t_palace_tunnels(self, wing_a: str = None, wing_b: str = None) -> str:
        return json.dumps(self.palace.find_tunnels(wing_a, wing_b), indent=2, default=str)

    def _t_palace_graph_stats(self) -> str:
        return json.dumps(self.palace.graph_stats(), indent=2, default=str)

    def _t_kg_add(self, subject: str, predicate: str, obj: str,
                  valid_from: str = None, source: str = None) -> str:
        result = self.kg.add(subject, predicate, obj, valid_from=valid_from, source=source)
        return f"Added: {subject} → {predicate} → {obj} | id={result}"

    def _t_kg_query(self, entity: str, as_of: str = None, direction: str = "both") -> str:
        facts = self.kg.query(entity, as_of=as_of, direction=direction)
        if not facts:
            return f"No facts found for: {entity}"
        lines = [f"KG facts for '{entity}':"]
        for f in facts[:20]:
            status = "✓" if f.get("current") else "✗"
            lines.append(f"  {status} {f.get('subject','')} → {f.get('predicate','')} → {f.get('object','')} [{f.get('valid_from','')}→{f.get('valid_to','')}]")
        return "\n".join(lines)

    def _t_kg_invalidate(self, subject: str, predicate: str, obj: str, ended: str = None) -> str:
        self.kg.invalidate(subject, predicate, obj, ended=ended)
        return f"Invalidated: {subject} → {predicate} → {obj} (ended: {ended or 'today'})"

    def _t_kg_timeline(self, entity: str = None) -> str:
        facts = self.kg.timeline(entity)
        if not facts:
            return "No timeline entries."
        lines = [f"Timeline{' for ' + entity if entity else ''}:"]
        for f in facts[:20]:
            lines.append(f"  {f.get('valid_from','?')} | {f.get('subject','')} → {f.get('predicate','')} → {f.get('object','')} {'(expired)' if f.get('valid_to') else ''}")
        return "\n".join(lines)

    def _t_kg_stats(self) -> str:
        return json.dumps(self.kg.stats(), indent=2)

    def _t_diary_write(self, entry: str, topic: str = "general") -> str:
        r = self.diary.write(entry, topic)
        return f"Diary entry saved: {r.get('id', r)}"

    def _t_diary_read(self, last_n: int = 10) -> str:
        r = self.diary.read(last_n)
        hits = r.get("results", [])
        if not hits:
            return "No diary entries yet."
        lines = ["Recent diary entries:"]
        for h in hits:
            lines.append(f"  {h['text'][:300]}")
        return "\n".join(lines)


# ── Helper: build OpenAI function schema ─────────────────────────────────────

def _fn(name: str, description: str, props: dict, required: List[str]) -> dict:
    properties = {}
    for k, v in props.items():
        if isinstance(v, tuple):
            prop = {"type": v[0]}
            if v[1]:
                prop["description"] = v[1]
            properties[k] = prop
        else:
            properties[k] = v
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }
