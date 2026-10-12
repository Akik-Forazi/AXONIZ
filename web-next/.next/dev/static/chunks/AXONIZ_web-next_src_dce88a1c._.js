(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_PROVIDERS",
    ()=>DEFAULT_PROVIDERS,
    "PROVIDER_CATALOG",
    ()=>PROVIDER_CATALOG,
    "useAxonizStore",
    ()=>useAxonizStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-client] (ecmascript)");
"use client";
;
;
const PROVIDER_CATALOG = [
    {
        id: "llamacpp",
        name: "llama.cpp",
        category: "local",
        description: "Zero-overhead GGUF inference. The AXONIZ default.",
        defaultBaseUrl: "http://localhost:8080",
        needsApiKey: false,
        apiKeyLabel: "",
        apiKeyPlaceholder: "",
        docsUrl: "https://github.com/ggerganov/llama.cpp/tree/master/tools/server",
        popularModels: [
            "Qwen2.5-Coder-7B",
            "Llama-3.2-3B",
            "Phi-3.5-mini"
        ],
        pricePerMTokIn: 0,
        pricePerMTokOut: 0
    },
    {
        id: "lmstudio",
        name: "LM Studio",
        category: "local",
        description: "Local OpenAI-compatible server. Default port 1234.",
        defaultBaseUrl: "http://localhost:1234/v1",
        needsApiKey: false,
        apiKeyLabel: "API key (optional)",
        apiKeyPlaceholder: "lm-studio",
        docsUrl: "https://lmstudio.ai/docs/api-server",
        popularModels: [],
        pricePerMTokIn: 0,
        pricePerMTokOut: 0
    },
    {
        id: "ollama",
        name: "Ollama",
        category: "local",
        description: "Local Ollama daemon. Default port 11434.",
        defaultBaseUrl: "http://localhost:11434",
        needsApiKey: false,
        apiKeyLabel: "",
        apiKeyPlaceholder: "",
        docsUrl: "https://ollama.com/docs/api",
        popularModels: [
            "llama3.2:3b",
            "qwen2.5-coder:7b",
            "phi3.5"
        ],
        pricePerMTokIn: 0,
        pricePerMTokOut: 0
    },
    {
        id: "openai",
        name: "OpenAI",
        category: "cloud",
        description: "GPT-4o, o1, o3, and the rest. Cloud — breaks offline guarantee.",
        defaultBaseUrl: "https://api.openai.com/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "sk-...",
        docsUrl: "https://platform.openai.com/docs/api-reference",
        popularModels: [
            "gpt-4o",
            "gpt-4o-mini",
            "o1",
            "o3-mini",
            "gpt-4-turbo"
        ],
        pricePerMTokIn: 2.5,
        pricePerMTokOut: 10
    },
    {
        id: "openrouter",
        name: "OpenRouter",
        category: "cloud",
        description: "Unified API for 300+ models. Cheapest path to frontier.",
        defaultBaseUrl: "https://openrouter.ai/api/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "sk-or-...",
        docsUrl: "https://openrouter.ai/docs",
        popularModels: [
            "anthropic/claude-3.5-sonnet",
            "openai/gpt-4o",
            "google/gemini-pro-1.5",
            "meta-llama/llama-3.2-70b-instruct",
            "deepseek/deepseek-chat"
        ],
        pricePerMTokIn: 0.25,
        pricePerMTokOut: 0.75
    },
    {
        id: "gemini",
        name: "Google Gemini",
        category: "cloud",
        description: "Gemini 2.0 Flash / Pro / Ultra. Long context window.",
        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "AIza...",
        docsUrl: "https://ai.google.dev/gemini-api/docs",
        popularModels: [
            "gemini-2.0-flash",
            "gemini-2.0-pro",
            "gemini-1.5-pro",
            "gemini-1.5-flash"
        ],
        pricePerMTokIn: 0.075,
        pricePerMTokOut: 0.3
    },
    {
        id: "anthropic",
        name: "Anthropic Claude",
        category: "cloud",
        description: "Claude 3.5 Sonnet, Opus, Haiku. Strong on agentic tasks.",
        defaultBaseUrl: "https://api.anthropic.com/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "sk-ant-...",
        docsUrl: "https://docs.anthropic.com/en/api/messages",
        popularModels: [
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229"
        ],
        pricePerMTokIn: 3,
        pricePerMTokOut: 15
    },
    {
        id: "groq",
        name: "Groq",
        category: "cloud",
        description: "LPU-accelerated inference. Fastest tokens/sec on the market.",
        defaultBaseUrl: "https://api.groq.com/openai/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "gsk_...",
        docsUrl: "https://console.groq.com/docs",
        popularModels: [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768"
        ],
        pricePerMTokIn: 0.59,
        pricePerMTokOut: 0.79
    },
    {
        id: "together",
        name: "Together AI",
        category: "cloud",
        description: "Open-weight models hosted. Cheap + fast for fine-tunes.",
        defaultBaseUrl: "https://api.together.xyz/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "...",
        docsUrl: "https://docs.together.ai",
        popularModels: [
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "Qwen/Qwen2.5-72B-Instruct-Turbo"
        ],
        pricePerMTokIn: 0.88,
        pricePerMTokOut: 1.28
    },
    {
        id: "mistral",
        name: "Mistral",
        category: "cloud",
        description: "Mistral + Mixtral hosted. European AI lab.",
        defaultBaseUrl: "https://api.mistral.ai/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "...",
        docsUrl: "https://docs.mistral.ai",
        popularModels: [
            "mistral-large-latest",
            "mistral-small-latest",
            "codestral-latest"
        ],
        pricePerMTokIn: 2,
        pricePerMTokOut: 6
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        category: "cloud",
        description: "DeepSeek V3 / R1. Cheapest reasoning models available.",
        defaultBaseUrl: "https://api.deepseek.com/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "sk-...",
        docsUrl: "https://api-docs.deepseek.com",
        popularModels: [
            "deepseek-chat",
            "deepseek-reasoner"
        ],
        pricePerMTokIn: 0.14,
        pricePerMTokOut: 0.28
    },
    {
        id: "fireworks",
        name: "Fireworks AI",
        category: "cloud",
        description: "Fastest US-hosted inference for open-weight models.",
        defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "...",
        docsUrl: "https://docs.fireworks.ai",
        popularModels: [
            "accounts/fireworks/models/llama-v3p3-70b-instruct",
            "accounts/fireworks/models/qwen2p5-coder-32b-instruct"
        ],
        pricePerMTokIn: 0.9,
        pricePerMTokOut: 0.9
    },
    {
        id: "perplexity",
        name: "Perplexity",
        category: "cloud",
        description: "Sonar models with built-in web search grounding.",
        defaultBaseUrl: "https://api.perplexity.ai",
        needsApiKey: true,
        apiKeyLabel: "API key",
        apiKeyPlaceholder: "pplx-...",
        docsUrl: "https://docs.perplexity.ai",
        popularModels: [
            "sonar-pro",
            "sonar",
            "sonar-reasoning"
        ],
        pricePerMTokIn: 2,
        pricePerMTokOut: 8
    },
    {
        id: "custom",
        name: "Custom OpenAI-compatible",
        category: "local",
        description: "Any endpoint that speaks the OpenAI chat protocol.",
        defaultBaseUrl: "",
        needsApiKey: false,
        apiKeyLabel: "API key (optional)",
        apiKeyPlaceholder: "",
        docsUrl: "",
        popularModels: [],
        pricePerMTokIn: 0,
        pricePerMTokOut: 0
    }
];
const DEFAULT_PROVIDERS = Object.fromEntries(_c1 = PROVIDER_CATALOG.map(_c = (p)=>[
        p.id,
        {
            enabled: p.id === "llamacpp",
            baseUrl: p.defaultBaseUrl,
            apiKey: "",
            model: p.popularModels[0] ?? ""
        }
    ]));
_c2 = DEFAULT_PROVIDERS;
const DEFAULT_LLAMACPP = {
    modelPath: "~/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    nCtx: 8192,
    nGpuLayers: 0,
    nThreads: 8
};
const useAxonizStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
        token: null,
        username: null,
        sidebarCollapsed: false,
        activeModel: null,
        activeProvider: "llamacpp",
        dataSource: "unknown",
        providers: DEFAULT_PROVIDERS,
        llamacpp: DEFAULT_LLAMACPP,
        modelPickerOpen: false,
        setAuth: (token, username)=>set({
                token,
                username
            }),
        logout: ()=>set({
                token: null,
                username: null
            }),
        toggleSidebar: ()=>set((s)=>({
                    sidebarCollapsed: !s.sidebarCollapsed
                })),
        setSidebarCollapsed: (sidebarCollapsed)=>set({
                sidebarCollapsed
            }),
        openModelPicker: ()=>set({
                modelPickerOpen: true
            }),
        closeModelPicker: ()=>set({
                modelPickerOpen: false
            }),
        pickModel: (provider, model)=>set({
                activeProvider: provider,
                activeModel: model,
                providers: {
                    ...get().providers,
                    [provider]: {
                        ...get().providers[provider],
                        model
                    }
                },
                modelPickerOpen: false
            }),
        setActiveModel: (activeModel)=>set({
                activeModel
            }),
        setActiveProvider: (activeProvider)=>set({
                activeProvider
            }),
        setDataSource: (dataSource)=>set({
                dataSource
            }),
        setProvider: (id, patch)=>set((s)=>({
                    providers: {
                        ...s.providers,
                        [id]: {
                            ...s.providers[id],
                            ...patch
                        }
                    }
                })),
        setLlamacpp: (patch)=>set((s)=>({
                    llamacpp: {
                        ...s.llamacpp,
                        ...patch
                    }
                }))
    }), {
    name: "axoniz-store-v7",
    storage: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createJSONStorage"])(()=>localStorage),
    partialize: (s)=>({
            token: s.token,
            username: s.username,
            sidebarCollapsed: s.sidebarCollapsed,
            activeModel: s.activeModel,
            activeProvider: s.activeProvider,
            providers: s.providers,
            llamacpp: s.llamacpp
        }),
    version: 7,
    migrate: ()=>({
            token: null,
            username: null,
            sidebarCollapsed: false,
            activeModel: null,
            activeProvider: "llamacpp",
            dataSource: "unknown",
            providers: DEFAULT_PROVIDERS,
            llamacpp: DEFAULT_LLAMACPP,
            modelPickerOpen: false
        })
}));
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "DEFAULT_PROVIDERS$Object.fromEntries$PROVIDER_CATALOG.map");
__turbopack_context__.k.register(_c1, "DEFAULT_PROVIDERS$Object.fromEntries");
__turbopack_context__.k.register(_c2, "DEFAULT_PROVIDERS");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/use-chat-stream.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useChatStream",
    ()=>useChatStream
]);
/**
 * useChatStream — hook for SSE streaming chat against /api/axoniz/chat.
 *
 * Returns: { messages, isStreaming, send, stop, regenerate, clear }
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const uid = ()=>Math.random().toString(36).slice(2) + Date.now().toString(36);
function useChatStream(initialMessages = []) {
    _s();
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialMessages);
    const [isStreaming, setIsStreaming] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const abortRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const { activeProvider, activeModel, providers, llamacpp, setDataSource } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])();
    const send = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useChatStream.useCallback[send]": (content)=>{
            if (!content.trim() || isStreaming) return;
            const userMsg = {
                id: uid(),
                role: "user",
                content: content.trim(),
                timestamp: Date.now()
            };
            const assistantId = uid();
            const assistantMsg = {
                id: assistantId,
                role: "assistant",
                content: "",
                timestamp: Date.now(),
                pending: true
            };
            setMessages({
                "useChatStream.useCallback[send]": (prev)=>[
                        ...prev,
                        userMsg,
                        assistantMsg
                    ]
            }["useChatStream.useCallback[send]"]);
            setIsStreaming(true);
            const provider = providers[activeProvider];
            const history = [
                ...messages,
                userMsg
            ].filter({
                "useChatStream.useCallback[send].history": (m)=>m.role === "user" || m.role === "assistant"
            }["useChatStream.useCallback[send].history"]).map({
                "useChatStream.useCallback[send].history": (m)=>({
                        role: m.role,
                        content: m.content
                    })
            }["useChatStream.useCallback[send].history"]);
            const ac = new AbortController();
            abortRef.current = ac;
            ({
                "useChatStream.useCallback[send]": async ()=>{
                    try {
                        const res = await fetch("/api/axoniz/chat", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                message: content,
                                history,
                                provider: activeProvider,
                                baseUrl: activeProvider === "llamacpp" ? llamacpp.baseUrl || provider.baseUrl : provider.baseUrl,
                                apiKey: provider.apiKey,
                                model: activeModel || provider.model || undefined
                            }),
                            signal: ac.signal
                        });
                        const source = res.headers.get("x-axoniz-source");
                        if (source === "live") setDataSource("live");
                        else if (source === "mock") setDataSource("mock");
                        if (!res.ok || !res.body) {
                            throw new Error(`HTTP ${res.status}`);
                        }
                        const reader = res.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = "";
                        let acc = "";
                        while(true){
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, {
                                stream: true
                            });
                            const chunks = buffer.split("\n\n");
                            buffer = chunks.pop() ?? "";
                            for (const chunk of chunks){
                                const lines = chunk.split("\n");
                                const dataLine = lines.find({
                                    "useChatStream.useCallback[send].dataLine": (l)=>l.startsWith("data:")
                                }["useChatStream.useCallback[send].dataLine"]);
                                if (!dataLine) continue;
                                const payloadStr = dataLine.slice(5).trim();
                                if (!payloadStr || payloadStr === "[DONE]") continue;
                                try {
                                    const ev = JSON.parse(payloadStr);
                                    if (ev.type === "token" && typeof ev.value === "string") {
                                        acc += ev.value;
                                        setMessages({
                                            "useChatStream.useCallback[send]": (prev)=>prev.map({
                                                    "useChatStream.useCallback[send]": (m)=>m.id === assistantId ? {
                                                            ...m,
                                                            content: acc,
                                                            pending: false
                                                        } : m
                                                }["useChatStream.useCallback[send]"])
                                        }["useChatStream.useCallback[send]"]);
                                    } else if (ev.type === "thought" && typeof ev.value === "string") {
                                        acc += `_${ev.value}_\n\n`;
                                        setMessages({
                                            "useChatStream.useCallback[send]": (prev)=>prev.map({
                                                    "useChatStream.useCallback[send]": (m)=>m.id === assistantId ? {
                                                            ...m,
                                                            content: acc,
                                                            pending: false
                                                        } : m
                                                }["useChatStream.useCallback[send]"])
                                        }["useChatStream.useCallback[send]"]);
                                    } else if (ev.type === "done") {
                                        setMessages({
                                            "useChatStream.useCallback[send]": (prev)=>prev.map({
                                                    "useChatStream.useCallback[send]": (m)=>m.id === assistantId ? {
                                                            ...m,
                                                            pending: false,
                                                            content: acc || ev.summary || "(empty)"
                                                        } : m
                                                }["useChatStream.useCallback[send]"])
                                        }["useChatStream.useCallback[send]"]);
                                    } else if (ev.type === "error") {
                                        setMessages({
                                            "useChatStream.useCallback[send]": (prev)=>prev.map({
                                                    "useChatStream.useCallback[send]": (m)=>m.id === assistantId ? {
                                                            ...m,
                                                            pending: false,
                                                            error: true,
                                                            content: `⚠ ${ev.error || "Unknown error"}`
                                                        } : m
                                                }["useChatStream.useCallback[send]"])
                                        }["useChatStream.useCallback[send]"]);
                                    }
                                } catch  {
                                /* skip malformed */ }
                            }
                        }
                        setMessages({
                            "useChatStream.useCallback[send]": (prev)=>prev.map({
                                    "useChatStream.useCallback[send]": (m)=>m.id === assistantId ? {
                                            ...m,
                                            pending: false
                                        } : m
                                }["useChatStream.useCallback[send]"])
                        }["useChatStream.useCallback[send]"]);
                    } catch (err) {
                        const e = err;
                        if (e.name === "AbortError") {
                            setMessages({
                                "useChatStream.useCallback[send]": (prev)=>prev.map({
                                        "useChatStream.useCallback[send]": (m)=>m.id === assistantId ? {
                                                ...m,
                                                pending: false,
                                                content: m.content || "(stopped)"
                                            } : m
                                    }["useChatStream.useCallback[send]"])
                            }["useChatStream.useCallback[send]"]);
                        } else {
                            setMessages({
                                "useChatStream.useCallback[send]": (prev)=>prev.map({
                                        "useChatStream.useCallback[send]": (m)=>m.id === assistantId ? {
                                                ...m,
                                                pending: false,
                                                error: true,
                                                content: `⚠ ${e.message}`
                                            } : m
                                    }["useChatStream.useCallback[send]"])
                            }["useChatStream.useCallback[send]"]);
                        }
                    } finally{
                        setIsStreaming(false);
                        abortRef.current = null;
                    }
                }
            })["useChatStream.useCallback[send]"]();
        }
    }["useChatStream.useCallback[send]"], [
        isStreaming,
        messages,
        activeProvider,
        activeModel,
        providers,
        llamacpp,
        setDataSource
    ]);
    const stop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useChatStream.useCallback[stop]": ()=>{
            abortRef.current?.abort();
        }
    }["useChatStream.useCallback[stop]"], []);
    const regenerate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useChatStream.useCallback[regenerate]": ()=>{
            if (isStreaming) return;
            const lastUser = [
                ...messages
            ].reverse().find({
                "useChatStream.useCallback[regenerate].lastUser": (m)=>m.role === "user"
            }["useChatStream.useCallback[regenerate].lastUser"]);
            if (!lastUser) return;
            const idx = messages.findIndex({
                "useChatStream.useCallback[regenerate].idx": (m)=>m.id === lastUser.id
            }["useChatStream.useCallback[regenerate].idx"]);
            const trimmed = messages.slice(0, idx + 1);
            setMessages(trimmed);
            setTimeout({
                "useChatStream.useCallback[regenerate]": ()=>send(lastUser.content)
            }["useChatStream.useCallback[regenerate]"], 0);
        }
    }["useChatStream.useCallback[regenerate]"], [
        isStreaming,
        messages,
        send
    ]);
    const clear = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useChatStream.useCallback[clear]": ()=>{
            if (isStreaming) stop();
            setMessages([]);
        }
    }["useChatStream.useCallback[clear]"], [
        isStreaming,
        stop
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useChatStream.useEffect": ()=>{
            return ({
                "useChatStream.useEffect": ()=>abortRef.current?.abort()
            })["useChatStream.useEffect"];
        }
    }["useChatStream.useEffect"], []);
    return {
        messages,
        isStreaming,
        send,
        stop,
        regenerate,
        clear,
        setMessages
    };
}
_s(useChatStream, "pCZxVvxI1vyTnXcWF6FqMl42Dec=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/use-conversations.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useConversations",
    ()=>useConversations
]);
/**
 * useConversations — persists conversation list to localStorage.
 * Each conversation has: id, title, messages, createdAt, updatedAt.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
const STORAGE_KEY = "axoniz-conversations-v1";
function load() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch  {
        return [];
    }
}
function save(convs) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
    } catch  {
    /* quota */ }
}
const uid = ()=>Math.random().toString(36).slice(2) + Date.now().toString(36);
function useConversations() {
    _s();
    const [conversations, setConversations] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [activeId, setActiveId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Load on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useConversations.useEffect": ()=>{
            const loaded = load();
            setConversations(loaded);
            if (loaded.length > 0 && !activeId) {
                setActiveId(loaded[0].id);
            }
        }
    }["useConversations.useEffect"], []);
    // Persist on change
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useConversations.useEffect": ()=>{
            save(conversations);
        }
    }["useConversations.useEffect"], [
        conversations
    ]);
    const active = conversations.find((c)=>c.id === activeId) ?? null;
    const newConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useConversations.useCallback[newConversation]": ()=>{
            const conv = {
                id: uid(),
                title: "New chat",
                messages: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            setConversations({
                "useConversations.useCallback[newConversation]": (prev)=>[
                        conv,
                        ...prev
                    ]
            }["useConversations.useCallback[newConversation]"]);
            setActiveId(conv.id);
            return conv;
        }
    }["useConversations.useCallback[newConversation]"], []);
    const selectConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useConversations.useCallback[selectConversation]": (id)=>{
            setActiveId(id);
        }
    }["useConversations.useCallback[selectConversation]"], []);
    const deleteConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useConversations.useCallback[deleteConversation]": (id)=>{
            setConversations({
                "useConversations.useCallback[deleteConversation]": (prev)=>{
                    const filtered = prev.filter({
                        "useConversations.useCallback[deleteConversation].filtered": (c)=>c.id !== id
                    }["useConversations.useCallback[deleteConversation].filtered"]);
                    if (id === activeId) {
                        setActiveId(filtered[0]?.id ?? null);
                    }
                    return filtered;
                }
            }["useConversations.useCallback[deleteConversation]"]);
        }
    }["useConversations.useCallback[deleteConversation]"], [
        activeId
    ]);
    const renameConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useConversations.useCallback[renameConversation]": (id, title)=>{
            setConversations({
                "useConversations.useCallback[renameConversation]": (prev)=>prev.map({
                        "useConversations.useCallback[renameConversation]": (c)=>c.id === id ? {
                                ...c,
                                title,
                                updatedAt: Date.now()
                            } : c
                    }["useConversations.useCallback[renameConversation]"])
            }["useConversations.useCallback[renameConversation]"]);
        }
    }["useConversations.useCallback[renameConversation]"], []);
    const updateMessages = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useConversations.useCallback[updateMessages]": (id, messages)=>{
            setConversations({
                "useConversations.useCallback[updateMessages]": (prev)=>prev.map({
                        "useConversations.useCallback[updateMessages]": (c)=>{
                            if (c.id !== id) return c;
                            // Auto-title from first user message
                            const firstUser = messages.find({
                                "useConversations.useCallback[updateMessages].firstUser": (m)=>m.role === "user"
                            }["useConversations.useCallback[updateMessages].firstUser"]);
                            const title = c.title === "New chat" && firstUser ? firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? "…" : "") : c.title;
                            return {
                                ...c,
                                messages,
                                title,
                                updatedAt: Date.now()
                            };
                        }
                    }["useConversations.useCallback[updateMessages]"])
            }["useConversations.useCallback[updateMessages]"]);
        }
    }["useConversations.useCallback[updateMessages]"], []);
    return {
        conversations,
        active,
        activeId,
        newConversation,
        selectConversation,
        deleteConversation,
        renameConversation,
        updateMessages
    };
}
_s(useConversations, "1esqXG0JDKBJaDP9B9oke/BPLwY=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChatSidebar",
    ()=>ChatSidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Chat sidebar — left rail with "New chat" button + conversation list.
 * Matches z.ai's visual style: dark, compact, hover-to-reveal delete.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/plus.js [app-client] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/message-square.js [app-client] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/trash-2.js [app-client] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pen$2d$line$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Edit3$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/pen-line.js [app-client] (ecmascript) <export default as Edit3>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function timeAgo(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const day = Math.floor(diff / 86400000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day < 7) return `${day}d ago`;
    return new Date(ts).toLocaleDateString();
}
function ChatSidebar({ conversations, activeId, onNew, onSelect, onDelete, onRename }) {
    _s();
    const sidebarCollapsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "ChatSidebar.useAxonizStore[sidebarCollapsed]": (s)=>s.sidebarCollapsed
    }["ChatSidebar.useAxonizStore[sidebarCollapsed]"]);
    const username = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "ChatSidebar.useAxonizStore[username]": (s)=>s.username
    }["ChatSidebar.useAxonizStore[username]"]);
    const [editingId, setEditingId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [editValue, setEditValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    if (sidebarCollapsed) return null;
    const startEdit = (c)=>{
        setEditingId(c.id);
        setEditValue(c.title);
    };
    const commitEdit = ()=>{
        if (editingId && editValue.trim()) {
            onRename(editingId, editValue.trim());
        }
        setEditingId(null);
    };
    // Group by date
    const groups = {};
    for (const c of conversations){
        const d = new Date(c.updatedAt);
        const today = new Date();
        const yesterday = new Date(today.getTime() - 86400000);
        let key = "Older";
        if (d.toDateString() === today.toDateString()) key = "Today";
        else if (d.toDateString() === yesterday.toDateString()) key = "Yesterday";
        else key = d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
        });
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "flex w-[260px] shrink-0 flex-col border-r border-border bg-zinc-50 dark:bg-zinc-950/40 backdrop-blur-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 px-4 h-14 border-b border-border",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "size-7 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm",
                        children: "A"
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                        lineNumber: 77,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-semibold text-sm",
                        children: "AXONIZ"
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                        lineNumber: 80,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded",
                        children: "v0.1.3"
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                        lineNumber: 81,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                lineNumber: 76,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "p-2",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: onNew,
                    className: "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-zinc-900 border border-border hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                            lineNumber: 92,
                            columnNumber: 11
                        }, this),
                        "New chat"
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                    lineNumber: 88,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                lineNumber: 87,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 overflow-y-auto px-2 pb-2 space-y-4",
                children: [
                    conversations.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-center text-xs text-muted-foreground py-8 px-4",
                        children: [
                            "No conversations yet.",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                lineNumber: 102,
                                columnNumber: 13
                            }, this),
                            "Click ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-semibold",
                                children: "New chat"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                lineNumber: 103,
                                columnNumber: 19
                            }, this),
                            " to start."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                        lineNumber: 100,
                        columnNumber: 11
                    }, this),
                    Object.entries(groups).map(([label, items])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1",
                                    children: label
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                    lineNumber: 108,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-0.5",
                                    children: items.map((c)=>{
                                        const isActive = c.id === activeId;
                                        const isEditing = editingId === c.id;
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            onClick: ()=>!isEditing && onSelect(c.id),
                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-sm transition-colors", isActive ? "bg-zinc-200/70 dark:bg-zinc-800/80 text-foreground" : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-muted-foreground hover:text-foreground"),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"], {
                                                    className: "size-3.5 shrink-0 opacity-60"
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                    lineNumber: 126,
                                                    columnNumber: 21
                                                }, this),
                                                isEditing ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    autoFocus: true,
                                                    value: editValue,
                                                    onChange: (e)=>setEditValue(e.target.value),
                                                    onClick: (e)=>e.stopPropagation(),
                                                    onKeyDown: (e)=>{
                                                        if (e.key === "Enter") commitEdit();
                                                        if (e.key === "Escape") setEditingId(null);
                                                    },
                                                    className: "flex-1 bg-transparent border-b border-border focus:outline-none text-xs px-0.5"
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                    lineNumber: 128,
                                                    columnNumber: 23
                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "flex-1 truncate text-xs",
                                                    children: c.title || "Untitled"
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                    lineNumber: 140,
                                                    columnNumber: 23
                                                }, this),
                                                isEditing ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center gap-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: (e)=>{
                                                                e.stopPropagation();
                                                                commitEdit();
                                                            },
                                                            className: "size-5 flex items-center justify-center rounded hover:bg-zinc-300 dark:hover:bg-zinc-700",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                                className: "size-3"
                                                            }, void 0, false, {
                                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                                lineNumber: 148,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                            lineNumber: 144,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: (e)=>{
                                                                e.stopPropagation();
                                                                setEditingId(null);
                                                            },
                                                            className: "size-5 flex items-center justify-center rounded hover:bg-zinc-300 dark:hover:bg-zinc-700",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                                                className: "size-3"
                                                            }, void 0, false, {
                                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                                lineNumber: 154,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                            lineNumber: 150,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                    lineNumber: 143,
                                                    columnNumber: 23
                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center opacity-0 group-hover:opacity-100 transition-opacity",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: (e)=>{
                                                                e.stopPropagation();
                                                                startEdit(c);
                                                            },
                                                            className: "size-5 flex items-center justify-center rounded hover:bg-zinc-300 dark:hover:bg-zinc-700",
                                                            title: "Rename",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pen$2d$line$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Edit3$3e$__["Edit3"], {
                                                                className: "size-3"
                                                            }, void 0, false, {
                                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                                lineNumber: 164,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                            lineNumber: 159,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: (e)=>{
                                                                e.stopPropagation();
                                                                onDelete(c.id);
                                                            },
                                                            className: "size-5 flex items-center justify-center rounded hover:bg-red-500/20 text-red-500",
                                                            title: "Delete",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                className: "size-3"
                                                            }, void 0, false, {
                                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                                lineNumber: 171,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                            lineNumber: 166,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                                    lineNumber: 158,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, c.id, true, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                            lineNumber: 116,
                                            columnNumber: 19
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                    lineNumber: 111,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, label, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                            lineNumber: 107,
                            columnNumber: 11
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                lineNumber: 98,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "border-t border-border p-2",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-2 px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "size-7 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold uppercase",
                            children: (username || "U").slice(0, 1)
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                            lineNumber: 186,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex-1 min-w-0",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs font-medium truncate",
                                    children: username || "User"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                    lineNumber: 190,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-[10px] text-muted-foreground",
                                    children: "Free plan"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                                    lineNumber: 191,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                            lineNumber: 189,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                    lineNumber: 185,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
                lineNumber: 184,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx",
        lineNumber: 74,
        columnNumber: 5
    }, this);
}
_s(ChatSidebar, "bu92zbXZ4UMe3JUtDP+5+uPexxM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = ChatSidebar;
var _c;
__turbopack_context__.k.register(_c, "ChatSidebar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChatTopBar",
    ()=>ChatTopBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Chat top bar — sidebar toggle, model picker, theme toggle, user menu.
 * Matches z.ai's compact top bar.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/panel-left.js [app-client] (ecmascript) <export default as PanelLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sun.js [app-client] (ecmascript) <export default as Sun>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$moon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Moon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/moon.js [app-client] (ecmascript) <export default as Moon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$share$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Share2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/share-2.js [app-client] (ecmascript) <export default as Share2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/ellipsis.js [app-client] (ecmascript) <export default as MoreHorizontal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevrons-up-down.js [app-client] (ecmascript) <export default as ChevronsUpDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function useTheme() {
    _s();
    const [theme, setTheme] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("dark");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useTheme.useEffect": ()=>{
            const saved = localStorage.getItem("axoniz-theme");
            const initial = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
            setTheme(initial);
        }
    }["useTheme.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useTheme.useEffect": ()=>{
            document.documentElement.classList.toggle("dark", theme === "dark");
            localStorage.setItem("axoniz-theme", theme);
        }
    }["useTheme.useEffect"], [
        theme
    ]);
    return {
        theme,
        toggle: ()=>setTheme((t)=>t === "dark" ? "light" : "dark")
    };
}
_s(useTheme, "FlK6G7Zt7lQh0dxGWIvagq70vbs=");
function ChatTopBar() {
    _s1();
    const { toggleSidebar, activeProvider, activeModel, setActiveProvider, setActiveModel, providers } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])();
    const { theme, toggle } = useTheme();
    const [pickerOpen, setPickerOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const providerMeta = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].find((p)=>p.id === activeProvider);
    const displayModel = activeModel || providers[activeProvider]?.model || providerMeta?.popularModels[0] || "default";
    const displayProviderName = providerMeta?.name ?? activeProvider;
    // Group providers by category
    const localProviders = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].filter((p)=>p.category === "local");
    const cloudProviders = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].filter((p)=>p.category === "cloud");
    const selectProvider = (id, model)=>{
        setActiveProvider(id);
        setActiveModel(model);
        setPickerOpen(false);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "flex items-center gap-2 h-14 px-3 border-b border-border bg-background/95 backdrop-blur-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: toggleSidebar,
                className: "size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground",
                title: "Toggle sidebar",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeft$3e$__["PanelLeft"], {
                    className: "size-4"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                    lineNumber: 52,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setPickerOpen((v)=>!v),
                        className: "flex items-center gap-1.5 px-3 h-9 rounded-lg hover:bg-muted text-sm font-medium",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-foreground",
                                children: displayProviderName
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 61,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-muted-foreground",
                                children: "·"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 62,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-muted-foreground text-xs",
                                children: displayModel
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 63,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__["ChevronsUpDown"], {
                                className: "size-3.5 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 64,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                        lineNumber: 57,
                        columnNumber: 9
                    }, this),
                    pickerOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "fixed inset-0 z-40",
                                onClick: ()=>setPickerOpen(false)
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 68,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "absolute left-0 top-full mt-1 w-[320px] rounded-xl border border-border bg-popover shadow-lg z-50 overflow-hidden",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border",
                                        children: "Local providers"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                        lineNumber: 73,
                                        columnNumber: 15
                                    }, this),
                                    localProviders.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProviderRow, {
                                            provider: p,
                                            activeId: activeProvider,
                                            activeModel: displayModel,
                                            onSelect: (m)=>selectProvider(p.id, m)
                                        }, p.id, false, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                            lineNumber: 77,
                                            columnNumber: 17
                                        }, this)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-y border-border bg-muted/30",
                                        children: "Cloud providers"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                        lineNumber: 85,
                                        columnNumber: 15
                                    }, this),
                                    cloudProviders.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProviderRow, {
                                            provider: p,
                                            activeId: activeProvider,
                                            activeModel: displayModel,
                                            onSelect: (m)=>selectProvider(p.id, m)
                                        }, p.id, false, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                            lineNumber: 89,
                                            columnNumber: 17
                                        }, this)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "border-t border-border p-1",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>setPickerOpen(false),
                                            className: "w-full text-center text-xs text-muted-foreground hover:text-foreground py-1.5",
                                            children: "Configure in Settings →"
                                        }, void 0, false, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                            lineNumber: 98,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                        lineNumber: 97,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 72,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                lineNumber: 56,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto flex items-center gap-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: "size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground",
                        title: "Share",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$share$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Share2$3e$__["Share2"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                            lineNumber: 116,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                        lineNumber: 112,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: toggle,
                        className: "size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground",
                        title: "Toggle theme",
                        children: theme === "dark" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__["Sun"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                            lineNumber: 123,
                            columnNumber: 31
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$moon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Moon$3e$__["Moon"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                            lineNumber: 123,
                            columnNumber: 60
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                        lineNumber: 118,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: "size-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground",
                        title: "More",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__["MoreHorizontal"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                            lineNumber: 129,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                        lineNumber: 125,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                lineNumber: 111,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, this);
}
_s1(ChatTopBar, "PJjQyeHSRcyHpk1A54dR8V0582E=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        useTheme
    ];
});
_c = ChatTopBar;
function ProviderRow({ provider, activeId, activeModel, onSelect }) {
    const isActive = activeId === provider.id;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("px-3 py-2", isActive && "bg-accent/30"),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-sm font-medium",
                                children: provider.name
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 152,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[10px] text-muted-foreground",
                                children: provider.description
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 153,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                        lineNumber: 151,
                        columnNumber: 9
                    }, this),
                    provider.category === "cloud" && provider.pricePerMTokIn > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[10px] text-muted-foreground",
                        children: [
                            "$",
                            provider.pricePerMTokIn.toFixed(2),
                            "/M in"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                        lineNumber: 156,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                lineNumber: 150,
                columnNumber: 7
            }, this),
            provider.popularModels.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-wrap gap-1 mt-1.5",
                children: provider.popularModels.slice(0, 4).map((m)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>onSelect(m),
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("px-2 py-0.5 rounded text-[11px] font-mono border transition-colors", isActive && m === activeModel ? "bg-foreground text-background border-foreground" : "bg-transparent text-muted-foreground border-border hover:bg-muted"),
                        children: [
                            isActive && m === activeModel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                className: "size-2.5 inline mr-1"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                                lineNumber: 174,
                                columnNumber: 49
                            }, this),
                            m
                        ]
                    }, m, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                        lineNumber: 164,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
                lineNumber: 162,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx",
        lineNumber: 149,
        columnNumber: 5
    }, this);
}
_c1 = ProviderRow;
var _c, _c1;
__turbopack_context__.k.register(_c, "ChatTopBar");
__turbopack_context__.k.register(_c1, "ProviderRow");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Markdown",
    ()=>Markdown
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Markdown renderer with syntax-highlighted code blocks.
 * Uses react-markdown + react-syntax-highlighter.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$markdown$2f$lib$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__Markdown__as__default$3e$__ = __turbopack_context__.i("[project]/node_modules/react-markdown/lib/index.js [app-client] (ecmascript) <export Markdown as default>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$syntax$2d$highlighter$2f$dist$2f$esm$2f$prism$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Prism$3e$__ = __turbopack_context__.i("[project]/node_modules/react-syntax-highlighter/dist/esm/prism.js [app-client] (ecmascript) <export default as Prism>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$syntax$2d$highlighter$2f$dist$2f$esm$2f$styles$2f$prism$2f$one$2d$dark$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__oneDark$3e$__ = __turbopack_context__.i("[project]/node_modules/react-syntax-highlighter/dist/esm/styles/prism/one-dark.js [app-client] (ecmascript) <export default as oneDark>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/copy.js [app-client] (ecmascript) <export default as Copy>");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function CodeBlock({ language, value }) {
    _s();
    const [copied, setCopied] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const copy = ()=>{
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(()=>setCopied(false), 1500);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "group relative my-3 rounded-lg overflow-hidden border border-border bg-[#282c34]",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between px-4 py-2 bg-[#21252b] border-b border-[#181a1f]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-zinc-400 font-mono",
                        children: language || "text"
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                        lineNumber: 22,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: copy,
                        className: "flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 transition-colors",
                        children: [
                            copied ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                className: "size-3"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                                lineNumber: 27,
                                columnNumber: 21
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__["Copy"], {
                                className: "size-3"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                                lineNumber: 27,
                                columnNumber: 52
                            }, this),
                            copied ? "Copied" : "Copy"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                        lineNumber: 23,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                lineNumber: 21,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$syntax$2d$highlighter$2f$dist$2f$esm$2f$prism$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Prism$3e$__["Prism"], {
                language: language || "text",
                style: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$syntax$2d$highlighter$2f$dist$2f$esm$2f$styles$2f$prism$2f$one$2d$dark$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__oneDark$3e$__["oneDark"],
                customStyle: {
                    margin: 0,
                    padding: "1rem",
                    background: "transparent",
                    fontSize: "0.875rem"
                },
                codeTagProps: {
                    style: {
                        fontFamily: "var(--font-mono)"
                    }
                },
                children: value
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                lineNumber: 31,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
_s(CodeBlock, "NE86rL3vg4NVcTTWDavsT0hUBJs=");
_c = CodeBlock;
function Markdown({ content }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:bg-transparent prose-pre:p-0 prose-headings:mb-2 prose-headings:mt-4 prose-code:before:hidden prose-code:after:hidden prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$markdown$2f$lib$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__Markdown__as__default$3e$__["default"], {
            components: {
                code ({ inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const value = String(children).replace(/\n$/, "");
                    if (!inline && match) {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CodeBlock, {
                            language: match[1],
                            value: value
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                            lineNumber: 57,
                            columnNumber: 22
                        }, void 0);
                    }
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                        className: className,
                        ...props,
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                        lineNumber: 60,
                        columnNumber: 15
                    }, void 0);
                },
                a: ({ children, ...props })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        ...props,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        className: "text-blue-500 hover:underline",
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                        lineNumber: 66,
                        columnNumber: 13
                    }, void 0),
                table: ({ children })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "my-3 overflow-x-auto",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                            className: "border-collapse",
                            children: children
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                            lineNumber: 77,
                            columnNumber: 15
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                        lineNumber: 76,
                        columnNumber: 13
                    }, void 0),
                th: ({ children })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                        className: "border border-border px-3 py-1.5 text-left text-xs font-semibold bg-muted",
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                        lineNumber: 81,
                        columnNumber: 13
                    }, void 0),
                td: ({ children })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                        className: "border border-border px-3 py-1.5 text-xs",
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
                        lineNumber: 86,
                        columnNumber: 13
                    }, void 0)
            },
            children: content
        }, void 0, false, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
            lineNumber: 51,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx",
        lineNumber: 50,
        columnNumber: 5
    }, this);
}
_c1 = Markdown;
var _c, _c1;
__turbopack_context__.k.register(_c, "CodeBlock");
__turbopack_context__.k.register(_c1, "Markdown");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChatMessages",
    ()=>ChatMessages
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Chat message list — renders user bubbles + assistant markdown + streaming cursor.
 * Auto-scrolls to bottom on new tokens.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/user.js [app-client] (ecmascript) <export default as User>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/bot.js [app-client] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/copy.js [app-client] (ecmascript) <export default as Copy>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-client] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-client] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$markdown$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/markdown.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
function StreamingCursor() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "inline-block w-1.5 h-3.5 bg-foreground/80 ml-0.5 animate-pulse rounded-[1px]"
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
        lineNumber: 21,
        columnNumber: 5
    }, this);
}
_c = StreamingCursor;
function CopyButton({ text }) {
    _s();
    const [copied, setCopied] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const copy = ()=>{
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(()=>setCopied(false), 1500);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        onClick: copy,
        className: "size-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground",
        title: "Copy",
        children: copied ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
            className: "size-3.5 text-emerald-500"
        }, void 0, false, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
            lineNumber: 38,
            columnNumber: 17
        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__["Copy"], {
            className: "size-3.5"
        }, void 0, false, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
            lineNumber: 38,
            columnNumber: 67
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
_s(CopyButton, "NE86rL3vg4NVcTTWDavsT0hUBJs=");
_c1 = CopyButton;
function UserMessage({ msg }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex justify-end gap-3 px-4 sm:px-6 py-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "max-w-[80%] sm:max-w-[70%]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl rounded-tr-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
                        children: msg.content
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                        lineNumber: 47,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-[10px] text-muted-foreground/60 text-right mt-1 mr-1",
                        children: new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                        })
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                lineNumber: 46,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "size-7 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__["User"], {
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                lineNumber: 54,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, this);
}
_c2 = UserMessage;
function AssistantMessage({ msg, isStreaming, onRegenerate }) {
    const showCursor = isStreaming && msg.pending;
    const showActions = !msg.pending && msg.content.length > 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex gap-3 px-4 sm:px-6 py-3 group",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "size-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"], {
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                    lineNumber: 75,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                lineNumber: 74,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-w-0 max-w-[calc(100%-3rem)]",
                children: msg.error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-start gap-2 text-sm text-red-500 dark:text-red-400",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                            className: "size-4 shrink-0 mt-0.5"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                            lineNumber: 80,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "whitespace-pre-wrap",
                            children: msg.content
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                            lineNumber: 81,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                    lineNumber: 79,
                    columnNumber: 11
                }, this) : msg.content ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-sm leading-relaxed",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$markdown$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Markdown"], {
                                    content: msg.content
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                    lineNumber: 86,
                                    columnNumber: 15
                                }, this),
                                showCursor && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StreamingCursor, {}, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                    lineNumber: 87,
                                    columnNumber: 30
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                            lineNumber: 85,
                            columnNumber: 13
                        }, this),
                        showActions && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CopyButton, {
                                    text: msg.content
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                    lineNumber: 91,
                                    columnNumber: 17
                                }, this),
                                onRegenerate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: onRegenerate,
                                    className: "size-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground",
                                    title: "Regenerate",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                        lineNumber: 98,
                                        columnNumber: 21
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                    lineNumber: 93,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                            lineNumber: 90,
                            columnNumber: 15
                        }, this)
                    ]
                }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-2 text-sm text-muted-foreground",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex gap-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                    lineNumber: 107,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                    lineNumber: 108,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "size-1.5 rounded-full bg-current animate-bounce"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                                    lineNumber: 109,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                            lineNumber: 106,
                            columnNumber: 13
                        }, this),
                        msg.pending ? "Thinking..." : ""
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                    lineNumber: 105,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                lineNumber: 77,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
        lineNumber: 73,
        columnNumber: 5
    }, this);
}
_c3 = AssistantMessage;
function ChatMessages({ messages, isStreaming, onRegenerate }) {
    _s1();
    const endRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [stick, setStick] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    // Track if user is near bottom (sticky scroll)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChatMessages.useEffect": ()=>{
            const el = containerRef.current;
            if (!el) return;
            const onScroll = {
                "ChatMessages.useEffect.onScroll": ()=>{
                    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    setStick(distFromBottom < 100);
                }
            }["ChatMessages.useEffect.onScroll"];
            el.addEventListener("scroll", onScroll);
            return ({
                "ChatMessages.useEffect": ()=>el.removeEventListener("scroll", onScroll)
            })["ChatMessages.useEffect"];
        }
    }["ChatMessages.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChatMessages.useEffect": ()=>{
            if (stick) {
                endRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "end"
                });
            }
        }
    }["ChatMessages.useEffect"], [
        messages,
        stick
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: containerRef,
        className: "flex-1 overflow-y-auto",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "max-w-3xl mx-auto py-4 divide-y divide-border/40",
                children: messages.map((m)=>m.role === "user" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(UserMessage, {
                        msg: m
                    }, m.id, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                        lineNumber: 150,
                        columnNumber: 13
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AssistantMessage, {
                        msg: m,
                        isStreaming: isStreaming,
                        onRegenerate: onRegenerate
                    }, m.id, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                        lineNumber: 152,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                lineNumber: 147,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: endRef,
                className: "h-2"
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
                lineNumber: 161,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx",
        lineNumber: 143,
        columnNumber: 5
    }, this);
}
_s1(ChatMessages, "kRUL/1jT1Hzz4pjakFbU5VKCipY=");
_c4 = ChatMessages;
var _c, _c1, _c2, _c3, _c4;
__turbopack_context__.k.register(_c, "StreamingCursor");
__turbopack_context__.k.register(_c1, "CopyButton");
__turbopack_context__.k.register(_c2, "UserMessage");
__turbopack_context__.k.register(_c3, "AssistantMessage");
__turbopack_context__.k.register(_c4, "ChatMessages");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChatInput",
    ()=>ChatInput
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Chat input area — z.ai-style growing textarea with mode toggles + send button.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-up.js [app-client] (ecmascript) <export default as ArrowUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/square.js [app-client] (ecmascript) <export default as Square>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$paperclip$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Paperclip$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/paperclip.js [app-client] (ecmascript) <export default as Paperclip>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/brain.js [app-client] (ecmascript) <export default as Brain>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/globe.js [app-client] (ecmascript) <export default as Globe>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mic$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mic$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/mic.js [app-client] (ecmascript) <export default as Mic>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const MODES = [
    {
        id: "think",
        label: "Think",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__["Brain"]
    },
    {
        id: "search",
        label: "DeepSearch",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"]
    }
];
function ChatInput({ onSend, onStop, isStreaming, disabled }) {
    _s();
    const [value, setValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [mode, setMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("none");
    const taRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const { activeProvider, activeModel, providers } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])();
    const providerMeta = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].find((p)=>p.id === activeProvider);
    const modelLabel = activeModel || providers[activeProvider]?.model || providerMeta?.popularModels[0] || "default";
    // Auto-grow textarea
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChatInput.useEffect": ()=>{
            const ta = taRef.current;
            if (!ta) return;
            ta.style.height = "auto";
            ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
        }
    }["ChatInput.useEffect"], [
        value
    ]);
    const submit = (e)=>{
        e?.preventDefault();
        if (!value.trim() || isStreaming || disabled) return;
        onSend(value);
        setValue("");
    };
    const onKeyDown = (e)=>{
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-4 pb-3 pt-1",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "max-w-3xl mx-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "relative rounded-2xl border border-border bg-background shadow-sm focus-within:border-foreground/30 transition-colors",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-2 px-3 pt-2.5 text-[11px] text-muted-foreground",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-mono",
                                    children: [
                                        providerMeta?.name ?? activeProvider,
                                        " · ",
                                        modelLabel
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                    lineNumber: 59,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "opacity-40",
                                    children: "·"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                    lineNumber: 62,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        mode === "think" && "Thinking mode active",
                                        mode === "search" && "DeepSearch active",
                                        mode === "none" && "Press Enter to send, Shift+Enter for new line"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                    lineNumber: 63,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                            lineNumber: 58,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                            ref: taRef,
                            value: value,
                            onChange: (e)=>setValue(e.target.value),
                            onKeyDown: onKeyDown,
                            placeholder: "Ask anything",
                            rows: 1,
                            disabled: disabled,
                            className: "w-full resize-none bg-transparent border-0 px-3 pt-2 pb-1 text-sm focus:outline-none placeholder:text-muted-foreground/60 disabled:opacity-50",
                            style: {
                                minHeight: "40px",
                                maxHeight: "240px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                            lineNumber: 71,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1 px-2 py-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted",
                                    title: "Attach file",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$paperclip$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Paperclip$3e$__["Paperclip"], {
                                        className: "size-4"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                        lineNumber: 90,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                    lineNumber: 85,
                                    columnNumber: 13
                                }, this),
                                MODES.map((m)=>{
                                    const Icon = m.icon;
                                    const active = mode === m.id;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>setMode(active ? "none" : m.id),
                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium transition-colors", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"),
                                        title: m.label,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                                                className: "size-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                                lineNumber: 108,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "hidden sm:inline",
                                                children: m.label
                                            }, void 0, false, {
                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                                lineNumber: 109,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, m.id, true, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                        lineNumber: 96,
                                        columnNumber: 17
                                    }, this);
                                }),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted",
                                    title: "Voice",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mic$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mic$3e$__["Mic"], {
                                        className: "size-4"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                        lineNumber: 118,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                    lineNumber: 113,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "ml-auto",
                                    children: isStreaming ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: onStop,
                                        className: "size-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-80",
                                        title: "Stop generating",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                                            className: "size-3.5"
                                        }, void 0, false, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                            lineNumber: 128,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                        lineNumber: 123,
                                        columnNumber: 17
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>submit(),
                                        disabled: !value.trim() || disabled,
                                        className: "size-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-80 disabled:opacity-30",
                                        title: "Send",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__["ArrowUp"], {
                                            className: "size-4"
                                        }, void 0, false, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                            lineNumber: 137,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                        lineNumber: 131,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                                    lineNumber: 121,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                            lineNumber: 84,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                    lineNumber: 56,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-center text-[10px] text-muted-foreground/60 mt-2",
                    children: [
                        "AXONIZ can make mistakes. Verify important information.",
                        providerMeta?.category === "local" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "ml-1 text-emerald-500/80",
                            children: "● Local model — 100% offline"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                            lineNumber: 148,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
                    lineNumber: 145,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
            lineNumber: 55,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
}
_s(ChatInput, "dA24YY6ac/RSDKOGxmgWnLt7m+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = ChatInput;
var _c;
__turbopack_context__.k.register(_c, "ChatInput");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChatEmptyState",
    ()=>ChatEmptyState
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Chat empty state — z.ai-style greeting + 4 suggestion tiles.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-client] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$code$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Code$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/code.js [app-client] (ecmascript) <export default as Code>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/book-open.js [app-client] (ecmascript) <export default as BookOpen>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lightbulb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Lightbulb$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/lightbulb.js [app-client] (ecmascript) <export default as Lightbulb>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const SUGGESTIONS = [
    {
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"],
        title: "Brainstorm ideas",
        prompt: "Help me brainstorm 5 names for a developer-tool startup focused on local-first AI"
    },
    {
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$code$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Code$3e$__["Code"],
        title: "Write code",
        prompt: "Write a TypeScript function that debounces an async function with cancellation support"
    },
    {
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"],
        title: "Explain a concept",
        prompt: "Explain how WebTransport differs from WebSockets, with concrete use cases for each"
    },
    {
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lightbulb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Lightbulb$3e$__["Lightbulb"],
        title: "Solve a problem",
        prompt: "My Next.js production build is failing with 'Module not found' — how do I debug this?"
    }
];
function ChatEmptyState({ onPick }) {
    _s();
    const username = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "ChatEmptyState.useAxonizStore[username]": (s)=>s.username
    }["ChatEmptyState.useAxonizStore[username]"]);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const displayName = username ? `, ${username}` : "";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 flex flex-col items-center justify-center px-4 py-12",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "size-16 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-violet-500/20 mb-6",
                children: "A"
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "text-3xl sm:text-4xl font-semibold tracking-tight mb-1.5 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text",
                children: [
                    greeting,
                    displayName
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                lineNumber: 42,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-muted-foreground text-sm sm:text-base mb-8",
                children: "How can I help you today?"
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                lineNumber: 45,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl",
                children: SUGGESTIONS.map((s)=>{
                    const Icon = s.icon;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>onPick(s.prompt),
                        className: "group flex flex-col gap-1 p-4 rounded-xl border border-border bg-card hover:bg-accent/30 hover:border-foreground/20 transition-all text-left",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                                        className: "size-4 text-muted-foreground group-hover:text-foreground"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                                        lineNumber: 58,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-sm font-medium",
                                        children: s.title
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                                        lineNumber: 59,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                                lineNumber: 57,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs text-muted-foreground line-clamp-2",
                                children: s.prompt
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                                lineNumber: 61,
                                columnNumber: 15
                            }, this)
                        ]
                    }, s.title, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                        lineNumber: 52,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
                lineNumber: 48,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx",
        lineNumber: 38,
        columnNumber: 5
    }, this);
}
_s(ChatEmptyState, "s5LOqj70esVVcJnNFeD5XSg8hjA=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = ChatEmptyState;
var _c;
__turbopack_context__.k.register(_c, "ChatEmptyState");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ZaiChatLayout",
    ()=>ZaiChatLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Z.AI-style chat layout — full-screen layout that composes:
 *   - Left sidebar (conversation list)
 *   - Top bar (sidebar toggle, model picker, theme toggle)
 *   - Main area:
 *     - Empty state when no messages
 *     - Message list + streaming when messages exist
 *   - Bottom input area (always visible)
 *
 * Wires to the existing /api/axoniz/chat SSE backend via useChatStream.
 * Conversations persist to localStorage via useConversations.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$use$2d$chat$2d$stream$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/use-chat-stream.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$use$2d$conversations$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/use-conversations.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-sidebar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$topbar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-topbar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$messages$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-messages.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$empty$2d$state$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/chat-empty-state.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
function ZaiChatLayout() {
    _s();
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "ZaiChatLayout.useAxonizStore[token]": (s)=>s.token
    }["ZaiChatLayout.useAxonizStore[token]"]);
    const username = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "ZaiChatLayout.useAxonizStore[username]": (s)=>s.username
    }["ZaiChatLayout.useAxonizStore[username]"]);
    const sidebarCollapsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "ZaiChatLayout.useAxonizStore[sidebarCollapsed]": (s)=>s.sidebarCollapsed
    }["ZaiChatLayout.useAxonizStore[sidebarCollapsed]"]);
    const { conversations, active, activeId, newConversation, selectConversation, deleteConversation, renameConversation, updateMessages } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$use$2d$conversations$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useConversations"])();
    // Get messages from active conversation (or empty for new)
    const initialMessages = active?.messages ?? [];
    const stream = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$use$2d$chat$2d$stream$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useChatStream"])(initialMessages);
    // When the active conversation changes, reset the stream hook's messages
    // by replacing its state. We use a key on the layout to remount.
    // Easier: sync messages → conversation on every change.
    const lastSyncId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ZaiChatLayout.useEffect": ()=>{
            if (activeId && lastSyncId.current !== activeId) {
                lastSyncId.current = activeId;
                // Set stream messages to the conversation's stored messages
                stream.setMessages({
                    "ZaiChatLayout.useEffect": ()=>(active?.messages ?? []).map({
                            "ZaiChatLayout.useEffect": (m)=>({
                                    ...m
                                })
                        }["ZaiChatLayout.useEffect"])
                }["ZaiChatLayout.useEffect"]);
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["ZaiChatLayout.useEffect"], [
        activeId
    ]);
    // Persist messages back to conversation whenever they change
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ZaiChatLayout.useEffect": ()=>{
            if (activeId) {
                updateMessages(activeId, stream.messages);
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["ZaiChatLayout.useEffect"], [
        stream.messages,
        activeId
    ]);
    // Auto-create first conversation if empty
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ZaiChatLayout.useEffect": ()=>{
            if (conversations.length === 0) {
                newConversation();
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["ZaiChatLayout.useEffect"], [
        conversations.length
    ]);
    const handleSend = (content)=>{
        if (!activeId) {
            const conv = newConversation();
            // Wait for state update then send
            setTimeout(()=>stream.send(content), 0);
            return;
        }
        stream.send(content);
    };
    const handlePickSuggestion = (prompt)=>{
        handleSend(prompt);
    };
    const hasMessages = stream.messages.length > 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-screen w-screen overflow-hidden bg-background text-foreground",
        children: [
            !sidebarCollapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ChatSidebar"], {
                conversations: conversations,
                activeId: activeId,
                onNew: newConversation,
                onSelect: selectConversation,
                onDelete: deleteConversation,
                onRename: renameConversation
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx",
                lineNumber: 92,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col flex-1 min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$topbar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ChatTopBar"], {}, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx",
                        lineNumber: 102,
                        columnNumber: 9
                    }, this),
                    hasMessages ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$messages$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ChatMessages"], {
                        messages: stream.messages,
                        isStreaming: stream.isStreaming,
                        onRegenerate: stream.regenerate
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx",
                        lineNumber: 104,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$empty$2d$state$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ChatEmptyState"], {
                        onPick: handlePickSuggestion
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx",
                        lineNumber: 110,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$chat$2d$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ChatInput"], {
                        onSend: handleSend,
                        onStop: stream.stop,
                        isStreaming: stream.isStreaming
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx",
                        lineNumber: 112,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx",
                lineNumber: 101,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx",
        lineNumber: 90,
        columnNumber: 5
    }, this);
}
_s(ZaiChatLayout, "2PwWzr1PO5zBXSIRhBrEHSuLaW8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$use$2d$conversations$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useConversations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$use$2d$chat$2d$stream$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useChatStream"]
    ];
});
_c = ZaiChatLayout;
var _c;
__turbopack_context__.k.register(_c, "ZaiChatLayout");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/app/chat/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ChatPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Z.AI-style chat page — full-screen chat layout that bypasses the (auth)
 * dashboard layout so the chat takes the entire viewport (sidebar + main + input).
 *
 * Auth check still happens via the store — if no token, redirect to login.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$zai$2d$chat$2d$layout$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/zai-chat/zai-chat-layout.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function ChatPage() {
    _s();
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "ChatPage.useAxonizStore[token]": (s)=>s.token
    }["ChatPage.useAxonizStore[token]"]);
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChatPage.useEffect": ()=>{
            if (!token) router.replace("/");
        }
    }["ChatPage.useEffect"], [
        token,
        router
    ]);
    if (!token) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-screen items-center justify-center text-sm text-muted-foreground",
            children: "Redirecting to login..."
        }, void 0, false, {
            fileName: "[project]/AXONIZ/web-next/src/app/chat/page.tsx",
            lineNumber: 23,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$zai$2d$chat$2f$zai$2d$chat$2d$layout$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ZaiChatLayout"], {}, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/app/chat/page.tsx",
        lineNumber: 29,
        columnNumber: 10
    }, this);
}
_s(ChatPage, "yas+MW1xbCZ0Kd/zEqeefeV6yoU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = ChatPage;
var _c;
__turbopack_context__.k.register(_c, "ChatPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=AXONIZ_web-next_src_dce88a1c._.js.map