/**
 * axoniz.integrations
 * ====================
 * All integrations are now merged into UnifiedMemory.
 *
 *   unified_memory  ← SemanticMemory + MemPalace palace + KnowledgeGraph + AgentDiary
 *   goose           ← Bridge to goose serve HTTP API
 *   mcp             ← Generic MCP JSON-RPC client + registry
 *   multi_agent     ← Route tasks to specialized agents
 *   mempalace       ← Legacy shim → points to unified_memory
 *
 * Port of axoniz/integrations/__init__.py — like the Python package initializer,
 * only the UnifiedMemory layer is imported eagerly (the other modules are
 * side-effecting network bridges); their types are re-exported for convenience.
 */
export { UnifiedMemory, PalaceLayer, KnowledgeGraphLayer, AgentDiary } from "./unified_memory.js";
export type { PalaceSearchResult, PalaceSearchHit, PalaceStatus, VectorBackend } from "./unified_memory.js";
export type { GooseBridge } from "./goose.js";
export type { MCPClient, MCPRegistry } from "./mcp.js";
export type { MultiAgentRouter } from "./multi_agent.js";
