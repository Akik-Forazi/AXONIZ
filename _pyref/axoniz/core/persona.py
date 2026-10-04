"""
AXONIZ Persona Engine — concise identity and role system.
Loads roles from YAML and builds compact system prompts.
"""

import os
import yaml
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("axoniz.persona")


class Persona:
    def __init__(self, role: str = "beru"):
        self.role_id = role
        self.data = self._load_role(role)
        self.name = self.data.get("name", "BERU")
        self.title = self.data.get("title", "AI Agent")
        self.authority_level = int(self.data.get("authority_level", 5))
        self.sub_roles = self.data.get("sub_roles", [])
        self.heartbeat_instructions = self.data.get(
            "heartbeat_instructions",
            "Check system status, pending tasks, and trajectory health."
        )

    def _load_role(self, role_id: str) -> Dict[str, Any]:
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "roles", f"{role_id}.yaml"),
            f"axoniz/roles/{role_id}.yaml",
            f"roles/{role_id}.yaml",
        ]
        for path in possible_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = yaml.safe_load(f)
                        if data:
                            return data
                except Exception as e:
                    logger.error(f"Failed to load role {role_id} from {path}: {e}")
        logger.warning(f"[Persona] Role YAML '{role_id}.yaml' not found — using built-in default")
        return self._default_role()

    @staticmethod
    def _default_role() -> Dict[str, Any]:
        return {
            "name": "BERU",
            "title": "AI Agent",
            "personality": ["efficient", "analytical", "accountable"],
            "system_prompt_template": (
                "You are {name}, {title}.\n"
                "Rules: read before edit, use tools only, verify after changes, summarize on done.\n"
                "Tools: {tool_list}\n"
                "Personality: {personality_list}"
            ),
            "authority_level": 5,
            "sub_roles": [],
            "heartbeat_instructions": "Check system status and pending tasks.",
        }

    def build_system_prompt(self, workspace: str = ".", tool_names: List[str] = None, session_id: str = "default") -> str:
        template = self.data.get("system_prompt_template", self._default_role()["system_prompt_template"])
        personality = ", ".join(self.data.get("personality", []))
        tool_list = ", ".join(tool_names or [])

        # Render template with available fields
        context = {
            "name": self.name,
            "title": self.title,
            "personality_list": personality,
            "workspace": workspace,
            "session_id": session_id,
            "tool_list": tool_list,
        }

        try:
            prompt = template.format(**context)
        except KeyError as e:
            # Template references a field we don't have — strip unknown keys
            prompt = template
            for key in ["name", "title", "personality_list", "workspace", "session_id", "tool_list"]:
                prompt = prompt.replace("{" + key + "}", context.get(key, ""))
            logger.warning(f"[Persona] template referenced unknown key {e}, rendered with fallbacks")

        return prompt.strip()

    def build_heartbeat_prompt(self, recent_chat: str = "") -> str:
        return f"System check: {self.heartbeat_instructions}\nRecent context:\n{recent_chat}"

    def get_authority_level(self, action: str) -> int:
        if "delete" in action or "format" in action or "dangerous" in action:
            return 4
        if "write" in action:
            return 2
        return 1

    def is_autonomous(self, action: str) -> bool:
        return self.get_authority_level(action) <= self.authority_level


_persona_instance = None


def get_persona(role: str = "beru") -> Persona:
    global _persona_instance
    if _persona_instance is None or _persona_instance.role_id != role:
        _persona_instance = Persona(role=role)
    return _persona_instance

