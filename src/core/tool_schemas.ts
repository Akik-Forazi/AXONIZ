/**
 * Tool schemas exposed to the LLM (OpenAI-style function definitions).
 * Port of `_make_tool_schemas()` / `TOOL_SCHEMAS` from axoniz/core/agent.py.
 */

export interface JsonSchemaProp {
  type?: string;
  description?: string;
  default?: unknown;
}

export interface ToolFunctionSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, JsonSchemaProp>;
      required: string[];
    };
  };
}

export type ToolSchemaMap = Record<string, JsonSchemaProp>;

const S: JsonSchemaProp = { type: "string" };
const I: JsonSchemaProp = { type: "integer" };
const N: JsonSchemaProp = { type: "number" };

function fn(
  name: string,
  desc: string,
  props: Record<string, JsonSchemaProp>,
  req: string[],
): ToolFunctionSchema {
  return {
    type: "function",
    function: {
      name,
      description: desc,
      parameters: { type: "object", properties: props, required: req },
    },
  };
}

function makeToolSchemas(): ToolFunctionSchema[] {
  return [
    fn("file_read", "Read a file with line numbers.", { path: S }, ["path"]),
    fn("file_write", "Write/overwrite a file.", { path: S, content: S }, ["path", "content"]),
    fn("file_edit", "Find-and-replace inside a file.", { path: S, old: S, new: S }, [
      "path",
      "old",
      "new",
    ]),
    fn("file_delete", "Delete a file or directory.", { path: S }, ["path"]),
    fn("file_list", "List directory contents.", { path: { type: "string", default: "." } }, []),
    fn(
      "file_search",
      "Find files matching a glob pattern.",
      { path: { type: "string", default: "." }, pattern: S },
      ["pattern"],
    ),
    fn("file_append", "Append text to end of file.", { path: S, content: S }, ["path", "content"]),
    fn("shell_run", "Run a shell/CMD command.", { command: S }, ["command"]),
    fn("shell_python", "Execute Python code, capture output.", { code: S }, ["code"]),
    fn("web_get", "Fetch text content from a URL.", { url: S }, ["url"]),
    fn("web_search", "Search the web via DuckDuckGo.", { query: S }, ["query"]),
    fn("code_lint", "Lint a Python file with flake8.", { path: S }, ["path"]),
    fn("code_format", "Format a Python file with black.", { path: S }, ["path"]),
    fn("code_tree", "Show file/directory tree.", { path: { type: "string", default: "." } }, []),
    fn(
      "code_analyze",
      "List classes/functions in Python files.",
      { path: { type: "string", default: "." } },
      [],
    ),
    fn("memory_save", "Save key-value to persistent memory.", { key: S, value: S }, ["key", "value"]),
    fn("memory_get", "Get a value from persistent memory.", { key: S }, ["key"]),
    fn("memory_list", "List all memory keys.", {}, []),
    fn(
      "palace_search",
      "Semantic search across the palace. ALWAYS use before answering about past projects.",
      { query: S, wing: { type: "string" }, room: { type: "string" }, limit: I },
      ["query"],
    ),
    fn(
      "palace_store",
      "Save content to palace. wing=domain, room=sub-topic.",
      { wing: S, room: S, content: S },
      ["wing", "room", "content"],
    ),
    fn("palace_context", "Load palace overview. Call at session start.", {}, []),
    fn("palace_wings", "List all palace wings.", {}, []),
    fn("palace_rooms", "List rooms inside a wing.", { wing: S }, []),
    fn("palace_check_dup", "Check if content already exists.", { content: S, threshold: N }, [
      "content",
    ]),
    fn("palace_delete", "Delete a palace drawer by ID.", { drawer_id: S }, ["drawer_id"]),
    fn(
      "palace_graph_traverse",
      "Walk palace graph from a room.",
      { start_room: S, max_hops: I },
      ["start_room"],
    ),
    fn(
      "palace_find_tunnels",
      "Find rooms bridging two wings.",
      { wing_a: S, wing_b: S },
      [],
    ),
    fn("palace_graph_stats", "Palace graph overview.", {}, []),
    fn(
      "kg_add",
      "Add temporal fact: subject \u2192 predicate \u2192 object.",
      {
        subject: S,
        predicate: S,
        obj: S,
        valid_from: { type: "string" },
        source: { type: "string" },
      },
      ["subject", "predicate", "obj"],
    ),
    fn(
      "kg_query",
      "Query knowledge graph for an entity.",
      { entity: S, as_of: { type: "string" }, direction: { type: "string" } },
      ["entity"],
    ),
    fn(
      "kg_invalidate",
      "Mark a fact as no longer true.",
      { subject: S, predicate: S, obj: S, ended: { type: "string" } },
      ["subject", "predicate", "obj"],
    ),
    fn("kg_timeline", "Timeline of facts for an entity.", { entity: { type: "string" } }, []),
    fn("kg_stats", "Knowledge graph statistics.", {}, []),
    fn("diary_write", "Write a diary entry (AAAK format).", { entry: S, topic: { type: "string" } }, [
      "entry",
    ]),
    fn("diary_read", "Read recent diary entries.", { last_n: I }, []),
    fn(
      "get_time",
      "Get current date, time, day of week, or any time-related info.",
      {
        query: {
          type: "string",
          description: "What to return: time|date|datetime|day|year|all",
          default: "all",
        },
      },
      [],
    ),
    fn(
      "done",
      "Call when the task is fully complete.",
      { result: { type: "string", description: "Full summary of everything accomplished" } },
      ["result"],
    ),
    fn(
      "absolute_query",
      "Absolute search: Queries BOTH the current code graph (Axodex) and long-term semantic memory (Palace).",
      { query: S },
      ["query"],
    ),

    /* Swarm (The Worker Swarm) */
    fn(
      "swarm_spawn",
      "Decompose a complex task and execute it in parallel using a swarm of worker agents (Worker Swarm).",
      { task: S, workers: { type: "integer", default: 4 } },
      ["task"],
    ),
    fn(
      "shadow_step",
      "Speculative Execution: Create a temporary shadow branch, execute a task, test it, and merge only if 100% successful.",
      { task: S, test_cmd: { type: "string", description: "Command to run to verify success" } },
      ["task"],
    ),

    /* Axodex (The Axodex Indexer) */
    fn(
      "axodex_query",
      "Semantic search for concepts, functions, or execution flows in a million-line codebase.",
      { query: S, limit: I },
      ["query"],
    ),
    fn(
      "axodex_context",
      "Get full graph context for a symbol: callers, callees, definitions, and execution flows.",
      { name: S },
      ["name"],
    ),
    fn(
      "axodex_smart_read",
      "Superior read: Get symbol definition AND its immediate graph neighbors for maximum architectural context.",
      { symbol_name: S },
      ["symbol_name"],
    ),
    fn(
      "axodex_impact",
      "Blast radius analysis: what will break if I change this symbol? Shows upstream callers.",
      { target: S, direction: { type: "string", default: "upstream" } },
      ["target"],
    ),
    fn(
      "axodex_detect_changes",
      "Verify which symbols and execution flows are affected by your current uncommitted edits.",
      {},
      [],
    ),
    fn(
      "axodex_status",
      "Check codebase index freshness, symbol count, and repo statistics.",
      {},
      [],
    ),
    fn("axodex_analyze", "Force a full refresh of the codebase graph index.", {}, []),

    /* Git tools */
    fn("git_status", "Git status of workspace.", {}, []),
    fn("git_diff", "Git diff of changes.", { path: { type: "string" } }, []),
    fn("git_log", "Recent git commits.", { n: I }, []),
    fn("git_add", "Stage files for commit.", { path: { type: "string", default: "." } }, []),
    fn("git_commit", "Create a git commit.", { message: S }, ["message"]),
    fn("git_branch", "List git branches.", {}, []),
    fn("git_checkout", "Switch/create branch.", { branch: S, create: { type: "boolean" } }, ["branch"]),
    fn("git_push", "Push to remote.", { remote: { type: "string" }, branch: { type: "string" } }, []),
    fn("git_pull", "Pull from remote.", {}, []),
    fn("git_stash", "Stash uncommitted changes.", {}, []),

    /* Computer tools */
    fn(
      "war_room",
      "Summary of background daemon events, audits, and uncommitted changes.",
      {},
      [],
    ),
    fn("mouse_move", "Move mouse to (x, y) coordinates.", { x: I, y: I }, ["x", "y"]),
    fn(
      "mouse_click",
      "Click at (x, y) or current position.",
      { x: I, y: I, button: { type: "string", default: "left" } },
      [],
    ),
    fn("key_type", "Type text with the keyboard.", { text: S }, ["text"]),
    fn("key_press", "Press a special key (enter, esc, ctrl).", { key: S }, ["key"]),
    fn("screen_size", "Get screen resolution.", {}, []),
    fn(
      "screen_capture",
      "Take a screenshot.",
      { filename: { type: "string", default: "screenshot.png" } },
      [],
    ),
    fn("screen_find", "Find text coordinates on screen via OCR.", { text: S }, ["text"]),

    /* Goals (Phase 11) */
    fn(
      "goal_create",
      "Create a new high-level objective.",
      { title: S, description: S, deadline: S, priority: S },
      ["title"],
    ),
    fn("goal_list", "List current objectives and their scores.", { status: S }, []),
    fn(
      "goal_kr_add",
      "Add a Key Result to an objective.",
      { goal_id: S, title: S, target: S, deadline: S },
      ["goal_id", "title"],
    ),
    fn(
      "goal_action_add",
      "Add a daily action for a key result.",
      { kr_id: S, title: S, scheduled_date: S },
      ["kr_id", "title"],
    ),
    fn(
      "goal_update_score",
      "Update progress score (0.0-1.0).",
      { goal_id: S, score: N, kr_id: S },
      ["goal_id", "score"],
    ),
    fn("goal_action_complete", "Mark a daily action as done.", { action_id: S }, ["action_id"]),
    fn("goal_report", "Get a briefing on all active goals.", {}, []),
  ];
}

export const TOOL_SCHEMAS: ToolFunctionSchema[] = makeToolSchemas();

/** Names in declaration order (used for prompt rendering). */
export function toolNames(schemas: ToolFunctionSchema[] = TOOL_SCHEMAS): string[] {
  return schemas.map((s) => s.function.name);
}
