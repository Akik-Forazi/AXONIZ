#!/usr/bin/env node
/**
 * axoniz-bridge — zero-dependency OpenAI-compatible chat server.
 *
 * Bridges Open WebUI (or any OpenAI-protocol client) to axoniz's local
 * llama.cpp inference engine (node-llama-cpp). This is the seed of the
 * future `axoniz serve` command.
 *
 * Endpoints:
 *   GET  /v1/models                 — list configured GGUF models
 *   POST /v1/chat/completions       — streaming (SSE) + non-streaming
 *   GET  /health                    — liveness
 *
 * Design: stateless per request. Each request gets a fresh chat session so
 * conversation history is sent by the client (Open WebUI holds it), avoiding
 * the KV-cache double-apply a persistent session would cause.
 *
 * Run:
 *   MODEL=path/to/model.ggUF GPU_LAYERS=999 PORT=11435 node axoniz-bridge.mjs
 *
 * Env:
 *   MODELS      colon (:) separated list of GGUF paths (multi-model)
 *   MODEL       single GGUF path (shorthand for MODELS)
 *   PORT        listen port (default 11435)
 *   HOST        bind host (default 127.0.0.1)
 *   GPU_LAYERS  offload layers (default 999)
 *   CTX         context size (default 16384)
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/* ------------------------------------------------------------------ */
/* Startup banner — the axoniz style                                   */
/* ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT ?? 11435);
const HOST = process.env.HOST ?? "127.0.0.1";
const GPU_LAYERS = process.env.GPU_LAYERS ?? 999;
const CTX = Number(process.env.CTX ?? 16384);

const modelSpec = process.env.MODELS ?? process.env.MODEL ?? "";
const models = modelSpec
  .split(":")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => ({ id: path.basename(p).replace(/\.gguf$/i, ""), path: p, gguf: p.toLowerCase().endsWith(".gguf") }));

console.log("============================================================");
console.log(" AXONIZ BRIDGE  —  OpenAI-compatible local inference");
console.log(`   URL      : http://${HOST}:${PORT}/v1`);
console.log(`   Models   : ${models.map((m) => `${m.id} (${m.gguf ? "gguf" : "passthrough"})`).join(", ") || "none"}`);
console.log("============================================================");

/* ------------------------------------------------------------------ */
/* Lazy model registry — a Llama per GGUF, loaded on first use          */
/* ------------------------------------------------------------------ */

const llamaModP = import("node-llama-cpp").catch((e) => ({ __error: e }));
const registry = new Map(); // id -> { model, ctx, seq }
let llamaFactory = null;
let factoryError = null;

async function getFactory() {
  if (factoryError) throw factoryError;
  if (!llamaFactory) {
    const mod = await llamaModP;
    if (mod.__error) {
      factoryError = new Error(`node-llama-cpp unavailable: ${mod.__error.message}`);
      throw factoryError;
    }
    llamaFactory = await mod.getLlama();
  }
  return llamaFactory;
}

/** Load (once) and return a fresh chat session for a model id. */
async function acquireSession(modelId, systemPrompt, signal) {
  const spec = models.find((m) => m.id === modelId) ?? models[0];
  if (!spec) throw new Error("no model configured — start with MODELS=/path/to/model.gguf");
  if (!fs.existsSync(spec.path)) throw new Error(`GGUF not found: ${spec.path}`);

  const llama = await getFactory();
  const started = Date.now();

  let entry = registry.get(spec.id);
  if (!entry) {
    process.stderr.write(`[bridge] loading ${spec.id} ...`);
    const model = await llama.loadModel({ modelPath: spec.path, gpuLayers: GPU_LAYERS });
    entry = { model };
    registry.set(spec.id, entry);
    process.stderr.write(` done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  }

  const context = await entry.model.createContext({
    contextSize: CTX,
    flashAttention: true,
    batchSize: 512,
    threads: Math.max(1, (await import("node:os")).cpus().length - 1),
  });
  const sequence = context.getSequence();

  const { LlamaChatSession } = llamaModP instanceof Promise ? await llamaModP : llamaModP;
  const session = new LlamaChatSession({
    contextSequence: sequence,
    systemPrompt,
  });

  return { session, cleanup: () => void context.dispose?.().catch(() => {}), spec };
}

/* ------------------------------------------------------------------ */
/* OpenAI wire helpers                                                 */
/* ------------------------------------------------------------------ */

function json(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, { "content-type": "application/json", "content-length": buf.length });
  res.end(buf);
}

function sseChunk(res, id, model, delta, finish = false) {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish ? "stop" : null }],
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function htmlEscapeMd(s) {
  return s;
}

/** Compress a message list into (system, formatted turns). */
function normalizeMessages(messages) {
  const system = [];
  const turns = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    const role = typeof m?.role === "string" ? m.role : "user";
    const content = typeof m?.content === "string"
      ? m.content
      : Array.isArray(m?.content)
        ? m.content.filter((c) => c?.type === "text").map((c) => c.text ?? "").join("\n")
        : "";
    if (!content.trim()) continue;
    if (role === "system" || role === "developer") system.push(content);
    else turns.push({ role, content });
  }
  return { system: system.join("\n\n"), turns };
}

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  try {
    /* health ------------------------------------------------------- */
    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, models: models.map((m) => m.id) });
    }

    /* /v1/models ---------------------------------------------------- */
    if (url.pathname === "/v1/models" && req.method === "GET") {
      return json(res, 200, {
        object: "list",
        data: models.map((m) => ({ id: m.id, object: "model", owned_by: "axoniz-bridge" })),
      });
    }

    /* /v1/chat/completions ----------------------------------------- */
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

      const messages = body.messages ?? [];
      const { system, turns } = normalizeMessages(messages);
      if (turns.length === 0) return json(res, 400, { error: { message: "messages required" } });

      const requested = body.model ?? models[0]?.id ?? "";
      const id = `chatcmpl-${Date.now().toString(36)}`;

      // Build a compact transcript for the latest turn (history goes through
      // the client each time; the session is fresh per request).
      const prior = turns.slice(0, -1).map((t) => `${t.role}: ${htmlEscapeMd(t.content)}`).join("\n\n");
      const last = turns[turns.length - 1];
      const prompt = prior
        ? `### CONVERSATION SO FAR\n\n${prior}\n\n### NOW\n\n${last.role === "user" ? "" : "assistant: "}${last.content}`
        : last.content;

      const controller = new AbortController();
      req.on("close", () => controller.abort());

      const { session, cleanup, spec } = await acquireSession(requested, system, controller.signal);

      const wantStream = body.stream === true;
      if (!wantStream) {
        const text = await session.prompt(prompt, {
          maxTokens: body.max_tokens ?? 2048,
          temperature: body.temperature ?? 0.2,
          signal: controller.signal,
        });
        cleanup();
        return json(res, 200, {
          id,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: spec.id,
          choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      }

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      sseChunk(res, id, spec.id, { role: "assistant" });
      try {
        await session.prompt(prompt, {
          maxTokens: body.max_tokens ?? 2048,
          temperature: body.temperature ?? 0.2,
          signal: controller.signal,
          onTextChunk: (c) => sseChunk(res, id, spec.id, { content: c }),
        });
      } finally {
        sseChunk(res, id, spec.id, {}, true);
        res.write("data: [DONE]\n\n");
        res.end();
        cleanup();
      }
      return;
    }

    json(res, 404, { error: { message: `no route ${req.method} ${url.pathname}` } });
  } catch (e) {
    const msg = e?.message ?? String(e);
    process.stderr.write(`[bridge] error: ${msg}\n`);
    if (!res.headersSent) json(res, 500, { error: { message: msg } });
    else res.end(`data: ${JSON.stringify({ error: msg })}\n\ndata: [DONE]\n\n`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}/v1`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
