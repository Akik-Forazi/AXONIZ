import type { AgentDefinition } from "./definition.js";
import { CODER_AGENT_DEF, RESEARCH_AGENT_DEF, FILE_AGENT_DEF } from "./definition.js";
import { CoderAgent, ResearchAgent, FileAgent, type AgentConstructor } from "./specialized.js";

export interface RegisteredAgent {
  definition: AgentDefinition;
  agentClass: AgentConstructor;
}

export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();

  /** Registers a new agent definition and its corresponding class. */
  register(definition: AgentDefinition, agentClass: AgentConstructor): void {
    this.agents.set(definition.id, { definition, agentClass });
  }

  /** Retrieves a registered agent by its ID. */
  get(id: string): RegisteredAgent | undefined {
    return this.agents.get(id);
  }

  /** Returns all registered agent definitions. */
  list(): AgentDefinition[] {
    return Array.from(this.agents.values()).map(a => a.definition);
  }
}

export const agentRegistry = new AgentRegistry();

// Pre-register the standard built-in specialized agents
agentRegistry.register(CODER_AGENT_DEF, CoderAgent);
agentRegistry.register(RESEARCH_AGENT_DEF, ResearchAgent);
agentRegistry.register(FILE_AGENT_DEF, FileAgent);
