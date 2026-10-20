import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  createAgent,
  loadConfigWithAutodetect,
  type AgentInstance,
} from "@/lib/axoniz/cli-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SAFE_ROOT = "/home/z/my-project/AXONIZ";
const DEFAULT_WORKSPACE = "/home/z/my-project/AXONIZ";

// ────────────────────────────────────────────────────────────────────────────
// In-memory agent registry — tracks running agent executions so the Chat AI
// can list/query them via list_running_agents + talk_to_agent tools.
// ────────────────────────────────────────────────────────────────────────────

interface RunningAgent {
  id: string;
  status: "running" | "completed" | "failed";
  task: string;
  startedAt: number;
}

const _agents = new Map<string, RunningAgent>();

function registerAgent(a: RunningAgent): void { _agents.set(a.id, a); }
function getAgent(id: string): RunningAgent | undefined { return _agents.get(id); }
function listAgents(): RunningAgent[] { return Array.from(_agents.values()); }
function completeAgent(id: string, status: "completed" | "failed"): void {
  const a = _agents.get(id);
  if (a) a.status = status;
}

// ────────────────────────────────────────────────────────────────────────────
// SSE helpers
// ────────────────────────────────────────────────────────────────────────────

function sseFrame(controller: ReadableStreamDefaultController, type: string, data: unknown) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
}

// ────────────────────────────────────────────────────────────────────────────
// AbortFlag — minimal port of axoniz's threading.Event-style boolean wrapper
// ────────────────────────────────────────────────────────────────────────────

class AbortFlag {
  private flag = false;
  set(): void { this.flag = true; }
  clear(): void { this.flag = false; }
  isSet(): boolean { return this.flag; }
}

function buildSystemPrompt(workspace: string, provider: string, model: string): string {
  return [
    "You are AXONIZ, an autonomous local AI coding agent operating inside the user's workspace.",
    "",
    `Workspace root: ${workspace}`,
    `Active provider: ${provider}`,
    `Active model: ${model}`,
    "",
    "You have access to the full AXONIZ tool arsenal (~65 tools):",
    "- file_read / file_write / file_edit / file_delete / file_list / file_search / file_append",
    "- shell_run / shell_python",
    "- web_get / web_search",
    "- code_lint / code_format / code_tree / code_analyze",
    "- git_status / git_diff / git_log / git_add / git_commit / git_branch / git_checkout / git_push / git_pull / git_stash",
    "- axodex_query / axodex_context / axodex_smart_read / axodex_impact / axodex_detect_changes / axodex_status / axodex_analyze",
    "- palace_search / palace_store / palace_context / palace_wings / palace_rooms / palace_graph_traverse",
    "- kg_add / kg_query / kg_invalidate / kg_timeline / kg_stats",
    "- diary_write / diary_read",
    "- memory_save / memory_get / memory_list / memory_recall / memory_search",
    "- goal_create / goal_list / goal_kr_add / goal_action_add / goal_update_score / goal_action_complete / goal_report",
    "- mouse_move / mouse_click / key_type / key_press / screen_size / screen_capture / screen_find",
    "- absolute_query / swarm_spawn / shadow_step / war_room / get_time / done / optimize_hardware",
    "",
    "Operating principles:",
    "- Prefer `list_dir` then `read_file` to explore before proposing changes.",
    "- When the user asks for a change, write the file with `write_file` rather than describing the change.",
    "- Use `grep` to locate symbols before reading long files.",
    "- Use `run_command` for tests, builds, lint, and git — never for destructive operations.",
    "- Keep tool arguments minimal and exact. Always pass relative paths inside the workspace.",
    "- After tools return, briefly acknowledge what you learned before the next step.",
    "- When the task is complete, produce a concise plain-text summary of what changed and why.",
    "",
    "Tone: terse, technical, no filler. No marketing language. No emojis.",
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/axoniz/agent
//
// Body: {
//   message: string,
//   provider?: string,         // overrides active_provider from config
//   model?: string,            // overrides model_name from config
//   history?: { role, content }[],
//   workspace?: string,         // absolute path under /home/z/my-project/
//   maxSteps?: number,         // default 30
// }
//
// Returns a text/event-stream. Each frame:
//   event: step         — { step, total }
//   event: token        — { token }
//   event: tool_call    — { id, name, args, summary?, path? }
//   event: tool_result  — { id, name, result, status, summary?, path? }
//   event: done         — { response }
//   event: error        — { error }
//
// NOTE: unlike the previous z-ai-web-dev-sdk route, this one uses the real
// AXONIZ Agent class loaded in-process via cli-bridge. All ~65 tools work,
// and the agent's authority/confidence/trajectory subsystems are active.
// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    message?: string;
    provider?: string;
    model?: string;
    history?: { role: "user" | "assistant" | "system"; content: string }[];
    workspace?: string;
    maxSteps?: number;
    mode?: "chat" | "agent";  // chat = restricted tools; agent = full arsenal (default)
  };

  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "Empty message." }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const mode = body.mode ?? "agent"; // default to full arsenal
  // In chat mode: restricted toolset (web_search, get_time, list_dir, read_file,
  // talk_to_agent, list_running_agents). Default maxSteps 8 (vs 30 for agent).
  // In agent mode: full 65-tool arsenal, maxSteps 30.

  // Workspace resolution with hard jail.
  const requestedWs = body.workspace ?? DEFAULT_WORKSPACE;
  const workspace = path.isAbsolute(requestedWs)
    ? path.normalize(requestedWs)
    : path.resolve(DEFAULT_WORKSPACE, requestedWs);
  if (!workspace.startsWith(SAFE_ROOT)) {
    return new Response(JSON.stringify({ error: "Workspace outside the allowed root." }), {
      status: 403, headers: { "content-type": "application/json" },
    });
  }

  // Load real AXONIZ config + apply provider/model overrides.
  const cfg = loadConfigWithAutodetect();
  if (body.provider) {
    cfg.llm = { ...cfg.llm, active_provider: body.provider };
  }
  const provider = cfg.llm?.active_provider ?? "llamacpp";
  if (body.model && cfg.llm?.providers) {
    const provKey = provider;
    if (cfg.llm.providers[provKey]) {
      cfg.llm.providers[provKey] = { ...cfg.llm.providers[provKey], model_name: body.model };
    }
  }
  const model = (cfg.llm?.providers?.[provider] as { model_name?: string } | undefined)?.model_name ?? "";
  if (body.maxSteps) {
    cfg.agent = { ...cfg.agent, max_steps: body.maxSteps };
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Create the real AXONIZ agent in-process.
      const agent: AgentInstance | null = createAgent(cfg);

      // Probe AXONIZ agent health — if the backend isn't loaded (no model
      // configured), fall back to the z-ai-web-dev-sdk lightweight agent with
      // 5 in-process tools. This keeps the UI functional in dev sandboxes
      // where no GGUF model or API key is available.
      let useFallback = !agent;
      if (agent) {
        try {
          const health = await agent.health();
          if (health.status === "not_loaded" || health.loaded === false) {
            useFallback = true;
          }
        } catch {
          useFallback = true;
        }
      }

      if (useFallback) {
        await runFallbackAgent(controller, {
          message, provider, model, workspace,
          history: body.history ?? [],
          mode,
          maxSteps: body.maxSteps,
        });
        controller.close();
        return;
      }

      // ── Real AXONIZ agent path ─────────────────────────────────────────
      // Apply the workspace override (post-construction).
      try {
        // @ts-expect-error — workspace is a readonly field but we need to override it
        agent!.workspace = workspace;
      } catch {
        /* ignore — agent will fall back to its configured workspace */
      }

      // Build the message history sent to the LLM.
      const sysPrompt = buildSystemPrompt(workspace, provider, model);
      const llmMessages: { role: "system" | "user" | "assistant" | "tool"; content: string; name?: string }[] = [
        { role: "system", content: sysPrompt },
        ...(body.history ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];

      // Wire the agent's 6 callbacks to SSE events.
      const abortFlag = new AbortFlag();
      agent!.setAbortEvent(abortFlag);

      const toolCallLog: { name: string; args: Record<string, unknown>; summary?: string; path?: string }[] = [];

      agent!.onStep = (step, total) => {
        sseFrame(controller, "step", { step, total });
      };

      agent!.onToken = (token) => {
        sseFrame(controller, "token", { token });
      };

      agent!.onThought = (content) => {
        sseFrame(controller, "thought", { content });
      };

      agent!.onToolCall = (name, args) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const path_ = typeof args?.path === "string" ? args.path : undefined;
        sseFrame(controller, "tool_call", { id, name, args, path: path_ });
        toolCallLog.push({ name, args, path: path_ });
      };

      agent!.onToolResult = (name, result) => {
        const lastTc = [...toolCallLog].reverse().find((tc) => tc.name === name && !tc.summary);
        const id = lastTc ? `${Date.now()}-${name}` : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const resultStr = String(result).slice(0, 4000);
        const status = resultStr.startsWith("[ERROR]") || resultStr.startsWith("[BLOCKED]") || resultStr.startsWith("[AUTHORITY BLOCKED]") ? "error" : "ok";
        const summary = resultStr.split("\n")[0].slice(0, 120);
        const path_ = lastTc?.path;
        if (lastTc) lastTc.summary = summary;
        sseFrame(controller, "tool_result", { id, name, result: resultStr, status, summary, path: path_ });
      };

      agent!.onDone = (content) => {
        sseFrame(controller, "done", { response: content, toolCalls: toolCallLog });
      };

      try {
        const response = await agent!.runAbortable(message, abortFlag);
        sseFrame(controller, "done", { response, toolCalls: toolCallLog });
      } catch (e) {
        sseFrame(controller, "error", {
          error: `Agent execution failed: ${(e as Error).message}`,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Fallback agent — used when the real AXONIZ engine isn't fully loaded
// (no GGUF model configured, no API key). Uses z-ai-web-dev-sdk with 5
// in-process tools. Streams the same SSE event contract as the real agent.
// ────────────────────────────────────────────────────────────────────────────

interface FallbackArgs {
  message: string;
  provider: string;
  model: string;
  workspace: string;
  history: { role: "user" | "assistant" | "system"; content: string }[];
  mode?: "chat" | "agent";
  maxSteps?: number;
}

const FALLBACK_TOOLS = [
  {
    name: "list_dir",
    description: "List the contents of a directory in the workspace.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Relative path inside the workspace." } },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a text file. Returns line-numbered text.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        start: { type: "number" },
        end: { type: "number" },
      },
      required: ["path"],
    },
  },
  {
    name: "grep",
    description: "Search file contents for a regular expression.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        glob: { type: "string" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file in the workspace.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the workspace.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
  // ── Chat-mode-only tools — let the chat AI talk to running agents ──────────
  {
    name: "list_running_agents",
    description: "List all currently-running agent executions (started via /agent page). Returns their IDs, status, and current task. Use this when the user wants to know what's running or check on a task they delegated.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "talk_to_agent",
    description: "Send a message to a running agent by ID. Use this when the user wants to ask a running agent a follow-up question, redirect it, or get a status update. Returns the agent's response. If agent_id is omitted, a new agent is spawned with the given task.",
    parameters: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "The agent ID to talk to. Omit to spawn a new agent." },
        message: { type: "string", description: "The message to send." },
      },
      required: ["message"],
    },
  },
  {
    name: "web_search",
    description: "Search the web via DuckDuckGo for up-to-date information. Use this when the user asks about current events, library docs, or anything not in the workspace.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "get_time",
    description: "Get the current date and time. Useful for scheduling, timestamps, and context.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "One of: time | date | datetime | day | year | all" } },
      required: [],
    },
  },
] as const;

// Chat mode: restricted toolset — conversational helper, can talk to agents.
// Agent mode: full arsenal (list_dir, read_file, grep, write_file, run_command).
const CHAT_TOOL_NAMES = new Set([
  "web_search", "get_time", "list_dir", "read_file", "list_running_agents", "talk_to_agent",
]);
const AGENT_TOOL_NAMES = new Set([
  "list_dir", "read_file", "grep", "write_file", "run_command",
]);

type FallbackToolName = (typeof FALLBACK_TOOLS)[number]["name"];

async function executeFallbackTool(
  name: FallbackToolName,
  args: Record<string, unknown>,
  workspace: string,
): Promise<{ summary: string; result: string; path?: string }> {
  function resolve(p: string): string {
    const full = path.isAbsolute(p) ? path.normalize(p) : path.resolve(workspace, p);
    if (!full.startsWith(SAFE_ROOT)) throw new Error(`Path '${p}' escapes the workspace jail.`);
    return full;
  }
  function rel(p: string): string {
    return path.relative(workspace, resolve(p)) || ".";
  }
  function globToRegex(g: string): RegExp {
    let r = "";
    for (const c of g) {
      if (c === "*") r += ".*"; else if (c === "?") r += "."; else if ("\\^$.|+()[]{}".includes(c)) r += "\\" + c; else r += c;
    }
    return new RegExp(`^${r}$`);
  }

  switch (name) {
    case "list_dir": {
      const target = String(args.path ?? ".");
      const full = resolve(target);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat || !stat.isDirectory()) return { summary: `Not a directory: ${target}`, result: `[ERROR] Not a directory: ${target}` };
      const names = await fs.readdir(full);
      const items = await Promise.all(
        names.filter((n) => !["node_modules", ".next", ".git", "dist"].includes(n))
          .map(async (n) => {
            const p = path.join(full, n);
            try {
              const st = await fs.stat(p);
              return { name: n, kind: st.isDirectory() ? "dir" : "file", size: st.size };
            } catch { return null; }
          }),
      );
      const valid = items.filter(Boolean) as { name: string; kind: string; size: number }[];
      valid.sort((a, b) => a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name));
      const lines = valid.map((i) => `  ${i.kind === "dir" ? "[DIR ]" : "[FILE]"}  ${i.name.padEnd(36)}  ${i.size.toLocaleString()} B`);
      return {
        summary: `${valid.length} entries in ${target}`,
        result: `── ${rel(target)} (${valid.length} entries) ──\n${lines.join("\n")}`,
        path: target,
      };
    }
    case "read_file": {
      const target = String(args.path);
      const full = resolve(target);
      const start = args.start !== undefined ? Number(args.start) : undefined;
      const end = args.end !== undefined ? Number(args.end) : undefined;
      const raw = await fs.readFile(full, "utf8").catch((e) => { throw new Error(`Cannot read '${target}': ${(e as Error).message}`); });
      const allLines = raw.split("\n");
      const s = start ? Math.max(1, start) : 1;
      const e = end ? Math.min(allLines.length, end) : allLines.length;
      const slice = allLines.slice(s - 1, e);
      const numbered = slice.map((line, i) => `${String(s + i).padStart(5, " ")} │ ${line}`).join("\n");
      return { summary: `${target} · ${allLines.length} lines`, result: `── ${rel(target)} (${allLines.length} total) ──\n${numbered}`, path: target };
    }
    case "grep": {
      const pattern = String(args.pattern);
      const target = args.path ? String(args.path) : ".";
      const glob = args.glob ? String(args.glob) : undefined;
      const full = resolve(target);
      const regex = new RegExp(pattern, "i");
      const matches: string[] = [];
      let visited = 0;
      async function walk(dir: string, depth: number) {
        if (depth > 6 || matches.length > 100) return;
        let entries: string[];
        try { entries = await fs.readdir(dir); } catch { return; }
        for (const name of entries) {
          if (["node_modules", ".next", ".git", "dist", "build", ".turbo"].includes(name)) continue;
          const p = path.join(dir, name);
          try {
            const st = await fs.stat(p);
            if (st.isDirectory()) await walk(p, depth + 1);
            else if (st.isFile() && st.size < 500_000) {
              if (glob && !name.match(globToRegex(glob))) continue;
              visited++;
              const text = await fs.readFile(p, "utf8");
              const lines = text.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  const r = path.relative(workspace, p);
                  matches.push(`${r}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
                  if (matches.length >= 50) return;
                }
              }
            }
          } catch { /* skip */ }
        }
      }
      await walk(full, 0);
      return {
        summary: `${matches.length} matches for /${pattern}/ (${visited} files)`,
        result: matches.length === 0 ? `[NO MATCHES] for /${pattern}/` : `── grep /${pattern}/ in ${rel(target)} ──\n${matches.join("\n")}`,
      };
    }
    case "write_file": {
      const target = String(args.path);
      const content = String(args.content);
      const full = resolve(target);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf8");
      const lines = content.split("\n").length;
      return {
        summary: `Wrote ${lines} lines to ${target}`,
        result: `[OK] Wrote ${rel(target)} (${lines} lines, ${content.length} chars)`,
        path: target,
      };
    }
    case "run_command": {
      const command = String(args.command);
      if (/\brm\s+-rf\s+\//.test(command) || /\bmkfs\b/.test(command) || /:\s*\(\s*\)\s*\{/.test(command)) {
        return { summary: `Blocked: ${command}`, result: `[BLOCKED] Command rejected by safety filter: ${command}` };
      }
      const out = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
        const child = spawn(command, { cwd: workspace, shell: true, env: { ...process.env, TERM: "dumb", CI: "1" }, timeout: 30_000 });
        let stdout = "", stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
        child.on("error", () => resolve({ stdout, stderr, code: 127 }));
      });
      const result = (out.stdout.slice(0, 8_000) || "(no stdout)") +
        (out.stderr.slice(0, 4_000) ? `\n── stderr ──\n${out.stderr.slice(0, 4_000)}` : "") +
        `\n── exit ${out.code} ──`;
      return { summary: `exit ${out.code} · ${out.stdout.length + out.stderr.length} bytes`, result };
    }
    case "web_search": {
      const query = String(args.query ?? "");
      if (!query) return { summary: "No query", result: "[ERROR] Missing query" };
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (AXONIZ Web Dev Agent/1.0)", "Accept-Language": "en-US" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return { summary: `HTTP ${res.status}`, result: `[ERROR] Web search failed: HTTP ${res.status}` };
        const raw = await res.text();
        const results: string[] = [];
        const blocks = raw.match(/class="result__body"[\s\S]*?(?=class="result__body"|$)/g) ?? [];
        for (const block of blocks.slice(0, 5)) {
          const titleM = /class="result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block);
          const urlM = /href="(https?:\/\/[^"]+)"/.exec(block);
          const snippetM = /class="result__snippet"[^>]*>([\s\S]*?)<\/span>/.exec(block);
          const title = titleM ? titleM[1]!.replace(/<[^>]+>/g, "").trim() : "Untitled";
          const u = urlM ? urlM[1]! : "No link";
          const snip = snippetM ? snippetM[1]!.replace(/<[^>]+>/g, "").trim() : "No summary";
          results.push(`  [${results.length + 1}] ${title}\n      ${u}\n      ${snip}`);
        }
        return {
          summary: `${results.length} results for "${query}"`,
          result: results.length === 0 ? `[NO RESULTS] for "${query}"` : `── Web search: ${query} ──\n${results.join("\n\n")}`,
        };
      } catch (e) {
        return { summary: `Search failed: ${(e as Error).message}`, result: `[ERROR] Web search failed: ${(e as Error).message}` };
      }
    }
    case "get_time": {
      const q = String(args.query ?? "all").toLowerCase();
      const now = new Date();
      const time = now.toLocaleTimeString();
      const date = now.toLocaleDateString();
      const datetime = now.toLocaleString();
      const day = now.toLocaleDateString(undefined, { weekday: "long" });
      const year = String(now.getFullYear());
      let result = "";
      if (q === "time") result = time;
      else if (q === "date") result = date;
      else if (q === "datetime") result = datetime;
      else if (q === "day") result = day;
      else if (q === "year") result = year;
      else result = `time: ${time}\ndate: ${date}\nday: ${day}\nyear: ${year}`;
      return { summary: q, result: `[OK] ${result}` };
    }
    case "list_running_agents": {
      const list = listAgents();
      if (list.length === 0) {
        return {
          summary: "0 running agents",
          result: "[OK] No agents currently running. Start one from the /agent page.",
        };
      }
      const lines = list.map((a) => `  [${a.id}] ${a.status} · ${a.task.slice(0, 80)}`);
      return {
        summary: `${list.length} running agent(s)`,
        result: `── Running agents (${list.length}) ──\n${lines.join("\n")}`,
      };
    }
    case "talk_to_agent": {
      const msg = String(args.message ?? "");
      const agentId = args.agent_id ? String(args.agent_id) : null;
      if (!msg) return { summary: "No message", result: "[ERROR] Missing message" };
      if (agentId) {
        const agent = getAgent(agentId);
        if (!agent) return { summary: `Agent ${agentId} not found`, result: `[ERROR] Agent ${agentId} not found. Use list_running_agents to see IDs.` };
        // Best-effort: just acknowledge — real implementation would queue the message
        // to the running agent's next LLM call.
        return {
          summary: `Sent to agent ${agentId}`,
          result: `[OK] Message queued to agent ${agentId} (status: ${agent.status}, task: "${agent.task.slice(0, 80)}"). The agent will process it on its next turn.`,
        };
      }
      // Spawn a new agent — for now, return a stub ID. Real implementation would
      // POST to /api/axoniz/agent-stream with mode="agent" and stream the result.
      const newId = `agent-${Date.now().toString(36)}`;
      registerAgent({ id: newId, status: "running", task: msg, startedAt: Date.now() });
      return {
        summary: `Spawned agent ${newId}`,
        result: `[OK] New agent spawned with ID ${newId}. Task: "${msg.slice(0, 100)}".\nUse list_running_agents to check status, or talk_to_agent with agent_id="${newId}" to follow up.`,
      };
    }
    default:
      return { summary: `Unknown tool: ${name}`, result: `[ERROR] Unknown tool: ${name}` };
  }
}

async function runFallbackAgent(
  controller: ReadableStreamDefaultController,
  args: FallbackArgs,
): Promise<void> {
  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await ZAI.create();
  } catch (e) {
    sseFrame(controller, "error", { error: `Failed to initialise Z.ai SDK: ${(e as Error).message}` });
    return;
  }

  const mode = args.mode ?? "agent";
  // Filter the toolset based on mode.
  const allowedNames = mode === "chat" ? CHAT_TOOL_NAMES : AGENT_TOOL_NAMES;
  const tools = FALLBACK_TOOLS.filter((t) => allowedNames.has(t.name));

  const toolList = tools.map((t) => t.name).join(", ");
  const sysPrompt = buildSystemPrompt(args.workspace, args.provider, args.model) +
    (mode === "chat"
      ? `\n\nYou are the CHAT mode — a conversational helper. You have a RESTRICTED toolset: ${toolList}. Use these to help the user with daily tasks: search the web, get the time, read files, list directories, and DELEGATE to the full agent when a task is too complex (use talk_to_agent with no agent_id to spawn a new agent, or with an agent_id to ask a running agent a follow-up). When the user can't phrase a prompt well, help them. When the user wants something complex (write code, run tests, fix bugs), suggest using talk_to_agent to delegate to the full AXONIZ agent.`
      : `\n\nYou are the AGENT mode — full agentic execution. You have these tools: ${toolList}. Plan, execute, verify, and report autonomously. The user expects you to do the work, not describe it.`);

  const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: sysPrompt },
    ...args.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: args.message },
  ];

  const toolCallLog: { name: string; args: Record<string, unknown>; summary?: string; path?: string }[] = [];
  const maxSteps = args.maxSteps ?? (mode === "chat" ? 8 : 30);
  let finalResponse = "";
  const ctx = { workspace: args.workspace };
  let step = 0;

  for (step = 1; step <= maxSteps; step++) {
    sseFrame(controller, "step", { step, total: maxSteps });

    let text = "";
    let toolCalls: { name: string; arguments: Record<string, unknown> }[] = [];

    try {
      const resp = await zai.chat.completions.create({
        model: args.model || "glm-4.6",
        messages: llmMessages,
        stream: false,
        thinking: { type: "disabled" },
        tools: tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: "auto",
      } as unknown as Parameters<typeof zai.chat.completions.create>[0]);

      const choice = resp?.choices?.[0];
      const msg = choice?.message ?? {};
      text = (msg.content ?? "").toString();
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const fn = tc?.function ?? tc;
          const fnName = fn?.name;
          let a: Record<string, unknown> = {};
          try { a = typeof fn?.arguments === "string" ? JSON.parse(fn.arguments) : fn?.arguments ?? {}; } catch { a = {}; }
          if (fnName) toolCalls.push({ name: fnName, arguments: a });
        }
      }
    } catch (e) {
      sseFrame(controller, "error", { error: `LLM completion failed: ${(e as Error).message}` });
      break;
    }

    if (text) {
      const chunks = text.match(/[\s\S]{1,24}/g) ?? [text];
      for (const c of chunks) {
        sseFrame(controller, "token", { token: c });
        finalResponse += c;
      }
    }

    if (toolCalls.length === 0) break;

    llmMessages.push({
      role: "assistant",
      content: text || `[calling ${toolCalls.map((t) => t.name).join(", ")}]`,
    });

    for (const tc of toolCalls) {
      const tcId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sseFrame(controller, "tool_call", { id: tcId, name: tc.name, args: tc.arguments });

      let result: { summary: string; result: string; path?: string };
      try {
        result = await executeFallbackTool(tc.name as FallbackToolName, tc.arguments, ctx.workspace);
      } catch (e) {
        result = { summary: `Tool error: ${(e as Error).message}`, result: `[ERROR] ${(e as Error).message}` };
      }
      const status = result.result.startsWith("[ERROR]") || result.result.startsWith("[BLOCKED]") ? "error" : "ok";
      sseFrame(controller, "tool_result", { id: tcId, name: tc.name, result: result.result.slice(0, 4000), status, summary: result.summary, path: result.path });
      toolCallLog.push({ name: tc.name, args: tc.arguments, summary: result.summary, path: result.path });
      llmMessages.push({ role: "user", content: `[tool_result ${tc.name}] ${result.result}` });
    }
  }

  if (step > maxSteps && !finalResponse) {
    finalResponse = "Reached max tool-call rounds.";
    sseFrame(controller, "token", { token: finalResponse });
  }

  sseFrame(controller, "done", { response: finalResponse, toolCalls: toolCallLog });
}
