module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/AXONIZ/web-next/src/lib/axoniz/mock-data.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Realistic mock responses for the AXONIZ backend, used when the actual
 * `axoniz --web` Express server on port 7860 is unreachable (preview envs,
 * standalone UI dev, etc.). All shapes match `api-types.ts` 1:1.
 *
 * When the real backend is online, the proxy route prefers real responses
 * and falls back to these only on connection error.
 */ __turbopack_context__.s([
    "MOCK_ABSOLUTE_QUERY",
    ()=>MOCK_ABSOLUTE_QUERY,
    "MOCK_AGENT_STATS",
    ()=>MOCK_AGENT_STATS,
    "MOCK_BACKENDS",
    ()=>MOCK_BACKENDS,
    "MOCK_CONFIG",
    ()=>MOCK_CONFIG,
    "MOCK_DOWNLOADS",
    ()=>MOCK_DOWNLOADS,
    "MOCK_HEALTH",
    ()=>MOCK_HEALTH,
    "MOCK_HF_MODEL_DETAIL",
    ()=>MOCK_HF_MODEL_DETAIL,
    "MOCK_HF_SEARCH",
    ()=>MOCK_HF_SEARCH,
    "MOCK_MEMORY",
    ()=>MOCK_MEMORY,
    "MOCK_MODELS",
    ()=>MOCK_MODELS,
    "MOCK_SWARM_STATUS",
    ()=>MOCK_SWARM_STATUS,
    "MOCK_SYSTEM_STATS",
    ()=>MOCK_SYSTEM_STATS,
    "MOCK_WAR_ROOM",
    ()=>MOCK_WAR_ROOM,
    "mockSseEventStream",
    ()=>mockSseEventStream
]);
const MOCK_BACKENDS = [
    {
        id: "llamacpp",
        name: "llama.cpp (native)",
        description: "Zero-overhead GGUF inference via node-llama-cpp. Default backend.",
        online: true
    },
    {
        id: "ollama",
        name: "Ollama",
        description: "HTTP bridge to local Ollama server. Compatible but adds latency.",
        online: false
    },
    {
        id: "lmstudio",
        name: "LM Studio",
        description: "HTTP bridge to LM Studio's OpenAI-compatible endpoint.",
        online: false
    },
    {
        id: "openai",
        name: "OpenAI-compatible",
        description: "Cloud or self-hosted OpenAI API. Breaks offline guarantee.",
        online: false
    }
];
const MOCK_CONFIG = {
    _home: "/home/axoniz/.axoniz",
    _models_dir: "/home/axoniz/.axoniz/models",
    llm: {
        active_provider: "llamacpp",
        providers: {
            llamacpp: {
                n_threads: 8,
                n_gpu_layers: 0,
                chat_format: "auto"
            }
        },
        n_ctx: 8192,
        n_gpu_layers: 0,
        n_threads: 8,
        model: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf"
    },
    swarm_models: {
        decomposer: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
        worker: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        critic: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
        merger: "Llama-3.2-3B-Instruct-Q4_K_M.gguf"
    },
    persona: "AXONIZ",
    authority_level: 3,
    voice: {
        tts_backend: "kokoro",
        stt_backend: "moonshine",
        wake_word_enabled: true
    },
    web: {
        port: 7860,
        host: "127.0.0.1"
    }
};
const MOCK_MODELS = {
    items: [
        {
            endpoint_id: "axoniz-endpoint",
            models: [
                "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
                "Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf",
                "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
                "Llama-3.2-3B-Instruct-Q8_0.gguf",
                "Phi-3.5-mini-instruct-Q4_K_M.gguf",
                "DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf",
                "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf"
            ]
        }
    ]
};
const MOCK_WAR_ROOM = {
    status: {
        active_task: "Refactor authentication module across 14 files",
        decomposer: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
        critic: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
        merger: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        started_at: Date.now() / 1000 - 184,
        progress: 0.62,
        workers: [
            {
                id: "w-01",
                role: "Worker",
                status: "complete",
                model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
                subtask: "audit auth.ts + authority.ts surface",
                result_score: 0.92,
                started_at: Date.now() / 1000 - 184,
                finished_at: Date.now() / 1000 - 121
            },
            {
                id: "w-02",
                role: "Worker",
                status: "complete",
                model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
                subtask: "extract token validation into AuthorityEngine",
                result_score: 0.88,
                started_at: Date.now() / 1000 - 180,
                finished_at: Date.now() / 1000 - 89
            },
            {
                id: "w-03",
                role: "Worker",
                status: "running",
                model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
                subtask: "rewrite /api/auth/login with structured errors",
                started_at: Date.now() / 1000 - 92
            },
            {
                id: "w-04",
                role: "Worker",
                status: "running",
                model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
                subtask: "migrate config loading to async loader",
                started_at: Date.now() / 1000 - 68
            },
            {
                id: "w-05",
                role: "Worker",
                status: "queued",
                subtask: "wire rate limiter into new auth flow"
            },
            {
                id: "w-06",
                role: "Worker",
                status: "queued",
                subtask: "rewrite integration tests for /api/auth/*"
            }
        ]
    }
};
const MOCK_SWARM_STATUS = {
    expert_mode: true,
    roles: {
        decomposer: {
            path: "/home/axoniz/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
            name: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
            ready: true
        },
        worker: {
            path: "/home/axoniz/.axoniz/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            name: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            ready: true
        },
        critic: {
            path: "/home/axoniz/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
            name: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
            ready: true
        },
        merger: {
            path: "/home/axoniz/.axoniz/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            name: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            ready: true
        }
    },
    description: "Domain-expert swarm active — models hot-swap per phase"
};
const MOCK_MEMORY = {
    palace: {
        wings: [
            {
                name: "Project",
                rooms: [
                    {
                        name: "AXONIZ",
                        drawers: [
                            {
                                name: "architecture",
                                count: 14
                            },
                            {
                                name: "decisions",
                                count: 13
                            },
                            {
                                name: "todo",
                                count: 6
                            }
                        ]
                    },
                    {
                        name: "Fraziym-Web",
                        drawers: [
                            {
                                name: "structure",
                                count: 9
                            }
                        ]
                    }
                ]
            },
            {
                name: "Skills",
                rooms: [
                    {
                        name: "Refactoring",
                        drawers: [
                            {
                                name: "rename-symbol",
                                count: 3
                            },
                            {
                                name: "extract-function",
                                count: 5
                            }
                        ]
                    },
                    {
                        name: "Bugfix",
                        drawers: [
                            {
                                name: "stacktrace-triage",
                                count: 8
                            }
                        ]
                    }
                ]
            },
            {
                name: "People",
                rooms: [
                    {
                        name: "Contacts",
                        drawers: [
                            {
                                name: "colleagues",
                                count: 12
                            }
                        ]
                    }
                ]
            }
        ],
        is_available: true
    },
    knowledge_graph: {
        facts: 1284,
        subjects: 612,
        recent: [
            {
                subject: "AXONIZ",
                predicate: "uses_backend",
                object: "node-llama-cpp",
                valid_from: 1735689600
            },
            {
                subject: "SwarmOrchestrator",
                predicate: "supports",
                object: "RAM-aware hot-swap",
                valid_from: 1735689600
            },
            {
                subject: "Axodex",
                predicate: "indexes",
                object: "4843 symbols",
                valid_from: 1735689600
            }
        ]
    },
    diary: {
        sessions_today: 4,
        last_event: "tool_call:axodex_query"
    }
};
const MOCK_HEALTH = {
    status: "active",
    backend: "llamacpp",
    model: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    model_loaded: true,
    uptime: 14782,
    memory: {
        palace: true,
        drawers: 318,
        kg: {
            facts: 1284,
            subjects: 612
        }
    }
};
const MOCK_SYSTEM_STATS = {
    cpu: {
        usage: 0.34,
        cores: 8
    },
    memory: {
        used: 9_842_302_976,
        total: 16_702_693_376,
        percent: 0.589
    },
    disk: {
        used: 284_398_295_040,
        total: 512_110_190_592,
        percent: 0.555
    },
    uptime: 86_400 + 14_782,
    platform: "linux x64",
    hostname: "axoniz-sandbox",
    axoniz_version: "0.2.1",
    load_avg: [
        1.24,
        0.98,
        0.81
    ]
};
const MOCK_AGENT_STATS = {
    tool_calls: 4821,
    tasks_completed: 184,
    messages_sent: 1248,
    tokens: {
        input: 9_842_316,
        output: 1_284_902
    },
    trajectory_size: 4821,
    active_session: "sess_8b3f9a2c",
    started_at: Date.now() / 1000 - 14_782
};
const MOCK_ABSOLUTE_QUERY = {
    result: {
        summary: "Found 6 symbol matches in the code graph and 3 memory palace entries related to 'agent loop'.",
        code_matches: [
            {
                type: "symbol",
                label: "Agent.run()",
                detail: "Main entry point — async generator yielding tokens and tool calls",
                score: 0.97,
                location: "src/core/agent.ts:412",
                snippet: "async *run(prompt: string, opts?: RunOpts): AsyncGenerator<...> { ... }"
            },
            {
                type: "symbol",
                label: "GoalLoop.run()",
                detail: "Goal-mode execution loop with plan / verify / repair phases",
                score: 0.91,
                location: "src/core/loop.ts:88"
            },
            {
                type: "symbol",
                label: "_exec(name, args)",
                detail: "Tool execution gate — authority + confidence + trajectory",
                score: 0.88,
                location: "src/core/agent.ts:612"
            }
        ],
        memory_matches: [
            {
                type: "memory",
                label: "DEC-007: node-llama-cpp over Ollama",
                detail: "Decision rationale — direct KV cache control",
                score: 0.84,
                location: "Palace › Project › AXONIZ › decisions"
            },
            {
                type: "fact",
                label: "TrajectoryStore records every tool call",
                detail: "SQLite behavioral memory for self-correction",
                score: 0.79,
                location: "KnowledgeGraph"
            }
        ]
    }
};
const MOCK_HF_SEARCH = {
    items: [
        {
            id: "Qwen/Qwen2.5-Coder-7B-Instruct",
            author: "Qwen",
            downloads: 184_392,
            likes: 412,
            pipeline_tag: "text-generation",
            tags: [
                "qwen",
                "coder",
                "7b",
                "instruct",
                "gguf-ready"
            ],
            library_name: "transformers",
            lastModified: "2026-08-14T10:00:00Z",
            gated: false
        },
        {
            id: "meta-llama/Llama-3.2-3B-Instruct",
            author: "meta-llama",
            downloads: 412_398,
            likes: 924,
            pipeline_tag: "text-generation",
            tags: [
                "llama-3.2",
                "3b",
                "instruct",
                "edge"
            ],
            library_name: "transformers",
            lastModified: "2026-07-02T14:00:00Z",
            gated: true
        },
        {
            id: "microsoft/Phi-3.5-mini-instruct",
            author: "microsoft",
            downloads: 98_421,
            likes: 312,
            pipeline_tag: "text-generation",
            tags: [
                "phi-3.5",
                "mini",
                "3.8b",
                "instruct"
            ],
            library_name: "transformers",
            lastModified: "2026-06-21T08:00:00Z",
            gated: false
        },
        {
            id: "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
            author: "deepseek-ai",
            downloads: 84_221,
            likes: 248,
            pipeline_tag: "text-generation",
            tags: [
                "deepseek",
                "coder",
                "v2",
                "lite",
                "16b-moe"
            ],
            library_name: "transformers",
            lastModified: "2026-05-18T12:00:00Z",
            gated: false
        },
        {
            id: "mistralai/Mistral-7B-Instruct-v0.3",
            author: "mistralai",
            downloads: 312_842,
            likes: 712,
            pipeline_tag: "text-generation",
            tags: [
                "mistral",
                "7b",
                "instruct",
                "v0.3"
            ],
            library_name: "transformers",
            lastModified: "2026-04-09T10:00:00Z",
            gated: false
        },
        {
            id: "TheBloke/Llama-3.2-3B-Instruct-GGUF",
            author: "TheBloke",
            downloads: 48_281,
            likes: 142,
            pipeline_tag: "text-generation",
            tags: [
                "gguf",
                "quantized",
                "q4_k_m",
                "ready-for-axoniz"
            ],
            lastModified: "2026-08-19T00:00:00Z",
            gated: false
        }
    ],
    total: 6
};
const MOCK_DOWNLOADS = [
    {
        repo_id: "Qwen/Qwen2.5-Coder-7B-Instruct",
        filename: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        progress: 0.42,
        speed_mbps: 18.4,
        status: "downloading",
        started_at: Date.now() / 1000 - 38,
        size_mb: 4427
    },
    {
        repo_id: "TheBloke/Llama-3.2-3B-Instruct-GGUF",
        filename: "llama-3.2-3b-instruct-q4_k_m.gguf",
        progress: 1,
        status: "completed",
        started_at: Date.now() / 1000 - 1840,
        finished_at: Date.now() / 1000 - 1244,
        size_mb: 1982
    }
];
const MOCK_HF_MODEL_DETAIL = MOCK_HF_SEARCH.items[0];
function* mockSseEventStream() {
    const now = ()=>Date.now() / 1000;
    yield {
        type: "health",
        status: "active",
        ts: now()
    };
    yield {
        type: "thought",
        value: "User asked to analyze the authentication flow — I'll fan out a swarm to audit /api/auth/* endpoints in parallel.",
        ts: now()
    };
    yield {
        type: "swarm",
        phase: "decompose",
        status: "complete",
        detail: "4 subtasks generated",
        ts: now()
    };
    yield {
        type: "swarm",
        worker_id: "w-01",
        phase: "worker",
        status: "running",
        detail: "auditing /api/auth/login handler",
        ts: now()
    };
    yield {
        type: "tool_call",
        tool: "axodex_query",
        args: {
            query: "auth login JWT"
        },
        ts: now()
    };
    yield {
        type: "tool_result",
        tool: "axodex_query",
        result: "3 execution flows found: login → token-issue → config-load → rate-limit",
        success: true,
        ts: now()
    };
    yield {
        type: "memory",
        action: "store",
        key: "session/auth-audit-context",
        ts: now()
    };
    yield {
        type: "swarm",
        worker_id: "w-02",
        phase: "worker",
        status: "running",
        detail: "extracting AuthorityEngine abstraction",
        ts: now()
    };
    yield {
        type: "tool_call",
        tool: "file_read",
        args: {
            path: "src/core/auth.ts"
        },
        ts: now()
    };
    yield {
        type: "tool_result",
        tool: "file_read",
        result: "Read 184 lines from src/core/auth.ts — JWT + bcrypt implementation",
        success: true,
        ts: now()
    };
    yield {
        type: "swarm",
        worker_id: "w-01",
        phase: "worker",
        status: "complete",
        detail: "audit finished — score 0.92",
        ts: now()
    };
    yield {
        type: "token",
        value: "Auth",
        ts: now()
    };
    yield {
        type: "token",
        value: " flow",
        ts: now()
    };
    yield {
        type: "token",
        value: " audited",
        ts: now()
    };
    yield {
        type: "token",
        value: ". Two",
        ts: now()
    };
    yield {
        type: "token",
        value: " refactor",
        ts: now()
    };
    yield {
        type: "token",
        value: " targets",
        ts: now()
    };
    yield {
        type: "token",
        value: " identified",
        ts: now()
    };
    yield {
        type: "token",
        value: ".",
        ts: now()
    };
    yield {
        type: "done",
        summary: "Auth audit complete. 2 refactor targets identified across 4 audited files.",
        ts: now()
    };
}
}),
"[project]/AXONIZ/web-next/src/app/api/axoniz/stream/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * AXONIZ SSE proxy — /api/axoniz/stream
 *
 * 1. If the real backend at localhost:7860 is up, forwards its SSE stream
 *    verbatim so live agent events reach the UI.
 * 2. If unreachable, runs the mock event generator from mock-data.ts so the
 *    UI's right-rail "live event feed" stays populated for demo purposes.
 *
 * The route keeps the connection open, sends a `:` heartbeat every 15s, and
 * shuts down cleanly when the client disconnects.
 */ __turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$mock$2d$data$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/axoniz/mock-data.ts [app-route] (ecmascript)");
;
const dynamic = "force-dynamic";
const runtime = "nodejs";
const BACKEND_URL = process.env.AXONIZ_BACKEND_URL ?? "http://127.0.0.1:7860";
async function GET(_req) {
    const encoder = new TextEncoder();
    // Try forwarding from the real backend first.
    try {
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(), 800);
        const upstream = await fetch(`${BACKEND_URL}/api/stream`, {
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (upstream.ok && upstream.body) {
            // We need to transform `event: x\ndata: y\n\n` frames into our own stream,
            // but for simplicity we just pipe the raw bytes through. The browser's
            // EventSource API will parse them correctly.
            return new Response(upstream.body, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache, no-transform",
                    Connection: "keep-alive",
                    "x-axoniz-source": "live"
                }
            });
        }
    } catch  {
    /* backend unreachable — fall back to mock stream */ }
    // Mock stream — emit scripted events with realistic pacing.
    const stream = new ReadableStream({
        start (controller) {
            let closed = false;
            const enqueue = (s)=>{
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(s));
                } catch  {
                    closed = true;
                }
            };
            const enqueueEvent = (ev)=>{
                const data = JSON.stringify(ev);
                enqueue(`event: ${ev.type}\n`);
                enqueue(`data: ${data}\n\n`);
            };
            const heartbeat = setInterval(()=>enqueue(": keepalive\n\n"), 15_000);
            heartbeat.unref?.();
            _req.signal.addEventListener("abort", ()=>{
                closed = true;
                clearInterval(heartbeat);
                try {
                    controller.close();
                } catch  {
                /* already closed */ }
            });
            const events = [
                ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$mock$2d$data$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["mockSseEventStream"])()
            ];
            let i = 0;
            const next = ()=>{
                if (closed) return;
                if (i >= events.length) {
                    // Loop after a long pause so the live feed keeps moving.
                    setTimeout(()=>{
                        i = 0;
                        next();
                    }, 12_000);
                    return;
                }
                enqueueEvent(events[i]);
                i += 1;
                // Pace events: tokens are quick, swarm events spaced out.
                const ev = events[i - 1];
                const delay = ev.type === "token" ? 90 : ev.type === "tool_result" ? 600 : 380;
                setTimeout(next, delay);
            };
            next();
        }
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "x-axoniz-source": "mock"
        }
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__efc38f30._.js.map