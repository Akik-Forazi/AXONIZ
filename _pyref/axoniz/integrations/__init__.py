"""
axoniz.integrations
====================
All integrations are now merged into UnifiedMemory.

  unified_memory  ← SemanticMemory + MemPalace palace + KnowledgeGraph + AgentDiary
  goose           ← Bridge to goose serve HTTP API
  mcp             ← Generic MCP JSON-RPC client + registry
  multi_agent     ← Route tasks to specialized agents
  mempalace       ← Legacy shim → points to unified_memory
"""

from axoniz.integrations.unified_memory import UnifiedMemory, PalaceLayer, KnowledgeGraphLayer, AgentDiary
