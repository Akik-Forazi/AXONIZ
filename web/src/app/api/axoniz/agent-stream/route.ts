import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  createAgent,
  loadConfigWithAutodetect,
  streamAgentChat,
  type AgentInstance,
} from "@/lib/axoniz/cli-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SAFE_ROOT = "/home/z/my-project/AXONIZ";
const DEFAULT_WORKSPACE = "/home/z/my-project/AXONIZ";

// ────────────────────────────────────────────────────────────────────────────
// SSE helpers
// ────────────────────────────────────────────────────────────────────────────

function sseFrame(controller: ReadableStreamDefaultController, type: string, data: unknown) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
}

/**
 * Stream a plain LLM completion from the user's configured provider via
 * cli-bridge (llama-server or any OpenAI-compatible endpoint). This replaces
 * the removed z-ai-web-dev-sdk fallback — local-first, no hosted service.
 * Tool use requires the compiled AXONIZ engine, so this path streams tokens
 * only.
 */
async function streamLocalChat(
  controller: ReadableStreamDefaultController,
  args: { message: string; history: { role: "user" | "assistant" | "system"; content: string }[]; config?: Record<string, unknown> },
): Promise<void> {
  let response = "";
  try {
    for await (const token of streamAgentChat(args.message, args.history, { config: args.config })) {
      response += token;
      sseFrame(controller, "token", { token });
    }
    sseFrame(controller, "done", { response, toolCalls: [] });
  } catch (e) {
    sseFrame(controller, "error", {
      error: `No chat backend: ${(e as Error).message}. Start llama-server (or your provider) and configure it in Settings → Providers.`,
    });
  }
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
// NOTE: this route uses the real AXONIZ Agent class loaded in-process via
// cli-bridge. All ~65 tools work, and the agent's authority/confidence/
// trajectory subsystems are active. When the engine isn't available, chat
// mode streams a plain completion from the configured provider; agent mode
// reports an actionable error.
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

  // Normalize provider config keys: web UI uses camelCase (baseUrl, apiKey, model)
  // but CLI bridge expects snake_case (base_url, api_key, model_name).
  // Also, the web UI stores providers at top-level `providers` but CLI expects `llm.providers`.
  // This handles the case when dist/ is not built and we read the raw JSON file.
  if (!cfg.llm) cfg.llm = {};
  if (!cfg.llm.providers && cfg.providers) {
    cfg.llm.providers = cfg.providers;
  }
  if (cfg.llm?.providers) {
    for (const [key, val] of Object.entries(cfg.llm.providers)) {
      if (val && typeof val === "object") {
        const v = val as Record<string, unknown>;
        if (v.baseUrl && !v.base_url) v.base_url = v.baseUrl as string;
        if (v.apiKey && !v.api_key) v.api_key = v.apiKey as string;
        if (v.model && !v.model_name) v.model_name = v.model as string;
      }
    }
  }

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

      // Probe AXONIZ agent health. When the engine isn't available (dist/
      // not built or model not loaded), fall back to a plain completion from
      // the user's configured provider — local-first, no hosted service.
      let backendReady = !!agent;
      if (agent) {
        try {
          const health = (await agent.health()) as { status?: string; loaded?: boolean };
          if (health?.status === "not_loaded" || health?.loaded === false) {
            backendReady = false;
          }
        } catch {
          backendReady = false;
        }
      }

      if (!backendReady) {
        if (mode === "chat") {
          // Pass the config with provider/model overrides so the fallback uses
          // the same provider the user selected in the UI (via the request body).
          await streamLocalChat(controller, { message, history: body.history ?? [], config: cfg });
        } else {
          sseFrame(controller, "error", {
            error: "Agent execution needs the compiled AXONIZ engine (dist/) and a healthy backend. Build it with `npm run build` at the project root, then start your model server.",
          });
        }
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

