"""
axoniz — Fully Local Super Agentic AI
Unified: SemanticMemory + MemPalace + KnowledgeGraph + AgentDiary + Hermes MemoryManager patterns
"""

from axoniz.core.agent import Agent
from axoniz.core.runner import Runner
from axoniz.core.memory import SemanticMemory as Memory
from axoniz.core.loop import LoopEngine
from axoniz.core.models import REGISTRY, get as get_model, recommended, by_tag
from axoniz.tools.file_tools import FileTools
from axoniz.tools.shell_tools import ShellTools
from axoniz.tools.web_tools import WebTools
from axoniz.tools.code_tools import CodeTools
from axoniz.integrations.unified_memory import UnifiedMemory

__version__ = "2.0.0"
__all__ = [
    "Agent", "Runner", "Memory", "UnifiedMemory", "LoopEngine",
    "REGISTRY", "get_model", "recommended", "by_tag",
    "FileTools", "ShellTools", "WebTools", "CodeTools",
]
