import type { AgentDefinition } from "./definition.js";
import { CODER_AGENT_DEF, RESEARCH_AGENT_DEF, FILE_AGENT_DEF } from "./definition.js";

export interface AgentMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface SpecializedAgentLike {
  messages: AgentMessage[];
  config: Record<string, unknown>;
  [key: string]: unknown;
}

export type AgentConstructor = new (...args: any[]) => SpecializedAgentLike;

export class FallbackAgent implements SpecializedAgentLike {
  messages: AgentMessage[];
  config: Record<string, unknown>;
  [key: string]: unknown;

  constructor(...args: any[]) {
    const opts = (args[0] ?? {}) as Record<string, unknown>;
    this.config = opts;
    this.messages = [];
  }
}

async function tryImportAgent(): Promise<Record<string, unknown> | null> {
  try {
    return (await import("../core/agent.js")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const _agentModule = await tryImportAgent();
export const AgentBase: AgentConstructor = (_agentModule?.["Agent"] as AgentConstructor | undefined) ?? FallbackAgent;

function applyExtraPrompt(agent: SpecializedAgentLike, extra: string): void {
  if (!agent.messages) {
    agent.messages = [];
  }
  const first = agent.messages[0];
  if (first) {
    first.content += extra;
  } else {
    agent.messages.push({ role: "system", content: extra });
  }
}

export class CoderAgent extends AgentBase {
  static readonly EXTRA_PROMPT = `
You are specialized in coding tasks. When given a coding task:
1. Understand the requirements
2. Plan the implementation
3. Write the code using file_write
4. Test it using shell_python or shell_run
5. Fix any errors
6. Return the final result
`;
  constructor(opts: Record<string, unknown> = {}) {
    super({ ...opts, definition: CODER_AGENT_DEF });
    applyExtraPrompt(this, CoderAgent.EXTRA_PROMPT);
  }
}

export class ResearchAgent extends AgentBase {
  static readonly EXTRA_PROMPT = `
You are specialized in research tasks. When given a research topic:
1. Search the web for information
2. Fetch relevant pages
3. Synthesize the information
4. Save key findings to memory
5. Write a comprehensive report to a file
`;
  constructor(opts: Record<string, unknown> = {}) {
    super({ ...opts, definition: RESEARCH_AGENT_DEF });
    applyExtraPrompt(this, ResearchAgent.EXTRA_PROMPT);
  }
}

export class FileAgent extends AgentBase {
  static readonly EXTRA_PROMPT = `
You are specialized in file and project management. You excel at:
- Organizing file structures
- Bulk file operations
- Finding and editing content across many files
- Creating project scaffolding
`;
  constructor(opts: Record<string, unknown> = {}) {
    super({ ...opts, definition: FILE_AGENT_DEF });
    applyExtraPrompt(this, FileAgent.EXTRA_PROMPT);
  }
}
