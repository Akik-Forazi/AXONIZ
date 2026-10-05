/**
 * __init__ for agents.
 * Port of axoniz/agents/__init__.py
 *
 * The Python package initializer is a bare docstring (it exports nothing), but
 * the port re-exports the specialized agents so `agents/index.ts` is a usable
 * barrel — additive, mirrors how `integrations/index.ts` works.
 */
export { CoderAgent, ResearchAgent, FileAgent, FallbackAgent, AgentBase } from "./specialized.js";
export type { SpecializedAgentLike, AgentConstructor, AgentMessage } from "./specialized.js";

export * from "./registry.js";
