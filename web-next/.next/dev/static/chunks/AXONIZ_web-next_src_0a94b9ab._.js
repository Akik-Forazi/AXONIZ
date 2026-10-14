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
"[project]/AXONIZ/web-next/src/components/ui/button.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button,
    "buttonVariants",
    ()=>buttonVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
            destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
            outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
            secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
            ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
            link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
            default: "h-9 px-4 py-2 has-[>svg]:px-3",
            sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
            lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
            icon: "size-9"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
});
function Button({ className, variant, size, asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Slot"] : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "button",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
            variant,
            size,
            className
        })),
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/button.tsx",
        lineNumber: 51,
        columnNumber: 5
    }, this);
}
_c = Button;
;
var _c;
__turbopack_context__.k.register(_c, "Button");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/ui/input.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Input",
    ()=>Input
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
;
;
function Input({ className, type, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        type: type,
        "data-slot": "input",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/input.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
_c = Input;
;
var _c;
__turbopack_context__.k.register(_c, "Input");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/ui/label.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Label",
    ()=>Label
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-label/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
"use client";
;
;
;
function Label({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"], {
        "data-slot": "label",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/label.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
_c = Label;
;
var _c;
__turbopack_context__.k.register(_c, "Label");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/lib/axoniz/client.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * AXONIZ typed client — the single entry point the UI uses to talk to the
 * backend. Every call goes through `/api/axoniz/*` Next.js routes which in
 * turn proxy to the real Express backend on port 7860 (with mock fallback).
 *
 * UI components should NEVER call fetch() with hardcoded AXONIZ URLs — they
 * import these helpers so the contract stays typed end-to-end.
 */ __turbopack_context__.s([
    "axonizClient",
    ()=>axonizClient,
    "parseSseFrame",
    ()=>parseSseFrame
]);
const BASE = "/api/axoniz";
async function getJson(path, init) {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...init?.headers ?? {}
        }
    });
    if (!res.ok) {
        const err = await res.json().catch(()=>({
                error: res.statusText
            }));
        throw new Error(err.error ?? `Request failed: ${res.status}`);
    }
    return await res.json();
}
async function postJson(path, body, init) {
    return getJson(path, {
        method: "POST",
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...init
    });
}
const axonizClient = {
    login: (body)=>postJson("/auth/login", body),
    /* ---------- Config ---------- */ getConfig: ()=>getJson("/config"),
    saveConfig: (patch)=>postJson("/config/save", patch),
    /* ---------- Models / Vault ---------- */ listModels: ()=>getJson("/models"),
    listBackends: ()=>getJson("/backends"),
    switchModel: (path)=>postJson("/model/switch", {
            path
        }),
    /* ---------- Forge ---------- */ searchModels: (q)=>getJson(`/models/search?q=${encodeURIComponent(q)}`),
    startDownload: (repo_id, filename)=>postJson("/models/download", {
            repo_id,
            filename
        }),
    listDownloads: ()=>getJson("/models/downloads"),
    /* ---------- Provider connection test ---------- */ /** Actually pings the user's configured endpoint and returns real models/errors. */ testProvider: (body)=>postJson("/providers/test", body),
    /* ---------- Chat & Agent ---------- */ submitTask: (body)=>postJson("/agent/task", body),
    /**
   * Real streaming chat — actually proxies to the user's configured provider
   * (any of 14 supported). Returns the raw Response; the caller parses SSE.
   */ chatStream: (body, signal)=>fetch(`${BASE}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal
        }),
    /* ---------- War Room / Swarm ---------- */ warRoom: ()=>getJson("/war_room"),
    swarmStatus: ()=>getJson("/swarm/status"),
    /* ---------- Memory ---------- */ memory: ()=>getJson("/memory"),
    absoluteQuery: (q)=>getJson(`/absolute_query?q=${encodeURIComponent(q)}`),
    /* ---------- System ---------- */ health: ()=>getJson("/health"),
    systemStats: ()=>getJson("/system/stats"),
    agentStats: ()=>getJson("/stats"),
    files: ()=>getJson("/files/list"),
    /* ---------- Voice ---------- */ voiceStatus: ()=>getJson("/voice/tts"),
    /* ---------- SSE stream ---------- */ streamUrl: ()=>`${BASE}/stream`,
    /* ---------- Reset ---------- */ reset: ()=>postJson("/reset")
};
function parseSseFrame(chunk) {
    const lines = chunk.split("\n");
    let event = "message";
    let dataParts = [];
    for (const line of lines){
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataParts.push(line.slice(5).trim());
        else if (line === "" && (event !== "message" || dataParts.length > 0)) {
            return {
                event,
                data: dataParts.join("\n")
            };
        }
    }
    if (event !== "message" || dataParts.length > 0) {
        return {
            event,
            data: dataParts.join("\n")
        };
    }
    return null;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LoginScreen",
    ()=>LoginScreen
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/label.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/axoniz/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
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
function LoginScreen() {
    _s();
    const [username, setUsername] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("axoniz");
    const [password, setPassword] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const setAuth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "LoginScreen.useAxonizStore[setAuth]": (s)=>s.setAuth
    }["LoginScreen.useAxonizStore[setAuth]"]);
    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        if (!username || password.length < 4) {
            setError("Username and a password (min 4 chars) are required.");
            return;
        }
        setLoading(true);
        try {
            const res = await __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].login({
                username,
                password
            });
            if ("error" in res) {
                setError(res.error);
                setLoading(false);
                return;
            }
            setAuth(res.token, res.username);
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(`Welcome, ${res.username}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
            setLoading(false);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-screen flex items-center justify-center p-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "w-full max-w-sm animate-fade-in",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-7 text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "inline-flex items-center gap-2.5 mb-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "w-7 h-7 rounded-md bg-foreground/8 border border-foreground/15 flex items-center justify-center",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-foreground font-mono text-xs font-semibold tracking-tighter",
                                        children: "AX"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                        lineNumber: 68,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 67,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-xl font-semibold tracking-tight",
                                    children: "AXONIZ"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 70,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 66,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs text-muted-foreground",
                            children: "Autonomous local agentic system"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 72,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                    lineNumber: 65,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                    onSubmit: onSubmit,
                    className: "surface rounded-lg p-6 space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                    htmlFor: "username",
                                    className: "text-xs font-medium text-muted-foreground",
                                    children: "Username"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 80,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                    id: "username",
                                    value: username,
                                    autoComplete: "username",
                                    onChange: (e)=>setUsername(e.target.value),
                                    className: "h-9 bg-input border-border text-sm",
                                    disabled: loading,
                                    autoFocus: true
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 83,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 79,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                    htmlFor: "password",
                                    className: "text-xs font-medium text-muted-foreground",
                                    children: "Password"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 95,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                    id: "password",
                                    type: "password",
                                    value: password,
                                    autoComplete: "current-password",
                                    onChange: (e)=>setPassword(e.target.value),
                                    placeholder: "••••••••",
                                    className: "h-9 bg-input border-border text-sm",
                                    disabled: loading
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 98,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 94,
                            columnNumber: 11
                        }, this),
                        error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive",
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 111,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                            type: "submit",
                            disabled: loading,
                            className: "w-full h-9 text-sm font-medium",
                            children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                        className: "w-3.5 h-3.5 mr-2 animate-spin"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                        lineNumber: 123,
                                        columnNumber: 17
                                    }, this),
                                    "Signing in…"
                                ]
                            }, void 0, true) : "Sign in"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 116,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                    lineNumber: 78,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-[11px] text-muted-foreground/60 text-center mt-5 leading-relaxed",
                    children: [
                        "Auth is handled by the AXONIZ backend (bcrypt + JWT).",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 134,
                            columnNumber: 11
                        }, this),
                        "Without the backend running, the proxy uses a clearly-tagged mock."
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                    lineNumber: 132,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
            lineNumber: 63,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
        lineNumber: 62,
        columnNumber: 5
    }, this);
}
_s(LoginScreen, "O8FLGehfquhbPDJDxNv0OF7Eo9k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = LoginScreen;
var _c;
__turbopack_context__.k.register(_c, "LoginScreen");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/ui/badge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Badge",
    ()=>Badge,
    "badgeVariants",
    ()=>badgeVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
const badgeVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden", {
    variants: {
        variant: {
            default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
            secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
            destructive: "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
            outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground"
        }
    },
    defaultVariants: {
        variant: "default"
    }
});
function Badge({ className, variant, asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Slot"] : "span";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "badge",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(badgeVariants({
            variant
        }), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/badge.tsx",
        lineNumber: 38,
        columnNumber: 5
    }, this);
}
_c = Badge;
;
var _c;
__turbopack_context__.k.register(_c, "Badge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Tooltip",
    ()=>Tooltip,
    "TooltipContent",
    ()=>TooltipContent,
    "TooltipProvider",
    ()=>TooltipProvider,
    "TooltipTrigger",
    ()=>TooltipTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-tooltip/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
"use client";
;
;
;
function TooltipProvider({ delayDuration = 0, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Provider"], {
        "data-slot": "tooltip-provider",
        delayDuration: delayDuration,
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
_c = TooltipProvider;
function Tooltip({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(TooltipProvider, {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"], {
            "data-slot": "tooltip",
            ...props
        }, void 0, false, {
            fileName: "[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx",
            lineNumber: 26,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx",
        lineNumber: 25,
        columnNumber: 5
    }, this);
}
_c1 = Tooltip;
function TooltipTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Trigger"], {
        "data-slot": "tooltip-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx",
        lineNumber: 34,
        columnNumber: 10
    }, this);
}
_c2 = TooltipTrigger;
function TooltipContent({ className, sideOffset = 0, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Portal"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Content"], {
            "data-slot": "tooltip-content",
            sideOffset: sideOffset,
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance", className),
            ...props,
            children: [
                children,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tooltip$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Arrow"], {
                    className: "bg-primary fill-primary z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx",
            lineNumber: 45,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx",
        lineNumber: 44,
        columnNumber: 5
    }, this);
}
_c3 = TooltipContent;
;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "TooltipProvider");
__turbopack_context__.k.register(_c1, "Tooltip");
__turbopack_context__.k.register(_c2, "TooltipTrigger");
__turbopack_context__.k.register(_c3, "TooltipContent");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/queries.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAbsoluteQueryMutation",
    ()=>useAbsoluteQueryMutation,
    "useAgentStatsQuery",
    ()=>useAgentStatsQuery,
    "useBackendsQuery",
    ()=>useBackendsQuery,
    "useConfigQuery",
    ()=>useConfigQuery,
    "useDownloadsQuery",
    ()=>useDownloadsQuery,
    "useHealthQuery",
    ()=>useHealthQuery,
    "useMemoryQuery",
    ()=>useMemoryQuery,
    "useModelSearchQuery",
    ()=>useModelSearchQuery,
    "useModelsQuery",
    ()=>useModelsQuery,
    "useSaveConfigMutation",
    ()=>useSaveConfigMutation,
    "useStartDownloadMutation",
    ()=>useStartDownloadMutation,
    "useSwarmStatusQuery",
    ()=>useSwarmStatusQuery,
    "useSwitchModelMutation",
    ()=>useSwitchModelMutation,
    "useSystemStatsQuery",
    ()=>useSystemStatsQuery,
    "useWarRoomQuery",
    ()=>useWarRoomQuery
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useMutation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/axoniz/client.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature(), _s3 = __turbopack_context__.k.signature(), _s4 = __turbopack_context__.k.signature(), _s5 = __turbopack_context__.k.signature(), _s6 = __turbopack_context__.k.signature(), _s7 = __turbopack_context__.k.signature(), _s8 = __turbopack_context__.k.signature(), _s9 = __turbopack_context__.k.signature(), _s10 = __turbopack_context__.k.signature(), _s11 = __turbopack_context__.k.signature(), _s12 = __turbopack_context__.k.signature(), _s13 = __turbopack_context__.k.signature(), _s14 = __turbopack_context__.k.signature();
"use client";
;
;
function useHealthQuery() {
    _s();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "health"
        ],
        queryFn: {
            "useHealthQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].health()
        }["useHealthQuery.useQuery"],
        refetchInterval: 10_000
    });
}
_s(useHealthQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useSystemStatsQuery() {
    _s1();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "system-stats"
        ],
        queryFn: {
            "useSystemStatsQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].systemStats()
        }["useSystemStatsQuery.useQuery"],
        refetchInterval: 5_000
    });
}
_s1(useSystemStatsQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useAgentStatsQuery() {
    _s2();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "agent-stats"
        ],
        queryFn: {
            "useAgentStatsQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].agentStats()
        }["useAgentStatsQuery.useQuery"],
        refetchInterval: 15_000
    });
}
_s2(useAgentStatsQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useConfigQuery() {
    _s3();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "config"
        ],
        queryFn: {
            "useConfigQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].getConfig()
        }["useConfigQuery.useQuery"]
    });
}
_s3(useConfigQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useModelsQuery() {
    _s4();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "models"
        ],
        queryFn: {
            "useModelsQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].listModels()
        }["useModelsQuery.useQuery"],
        refetchInterval: 30_000
    });
}
_s4(useModelsQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useBackendsQuery() {
    _s5();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "backends"
        ],
        queryFn: {
            "useBackendsQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].listBackends()
        }["useBackendsQuery.useQuery"],
        staleTime: 5 * 60 * 1000
    });
}
_s5(useBackendsQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useSwarmStatusQuery() {
    _s6();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "swarm-status"
        ],
        queryFn: {
            "useSwarmStatusQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].swarmStatus()
        }["useSwarmStatusQuery.useQuery"],
        refetchInterval: 8_000
    });
}
_s6(useSwarmStatusQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useWarRoomQuery() {
    _s7();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "war-room"
        ],
        queryFn: {
            "useWarRoomQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].warRoom()
        }["useWarRoomQuery.useQuery"],
        refetchInterval: 4_000
    });
}
_s7(useWarRoomQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useMemoryQuery() {
    _s8();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "memory"
        ],
        queryFn: {
            "useMemoryQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].memory()
        }["useMemoryQuery.useQuery"]
    });
}
_s8(useMemoryQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useDownloadsQuery() {
    _s9();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "downloads"
        ],
        queryFn: {
            "useDownloadsQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].listDownloads()
        }["useDownloadsQuery.useQuery"],
        refetchInterval: 2_500
    });
}
_s9(useDownloadsQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useModelSearchQuery(q, enabled) {
    _s10();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            "axoniz",
            "model-search",
            q
        ],
        queryFn: {
            "useModelSearchQuery.useQuery": ()=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].searchModels(q)
        }["useModelSearchQuery.useQuery"],
        enabled,
        staleTime: 60 * 1000
    });
}
_s10(useModelSearchQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useAbsoluteQueryMutation() {
    _s11();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"])({
        mutationFn: {
            "useAbsoluteQueryMutation.useMutation": (q)=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].absoluteQuery(q)
        }["useAbsoluteQueryMutation.useMutation"]
    });
}
_s11(useAbsoluteQueryMutation, "wwwtpB20p0aLiHIvSy5P98MwIUg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"]
    ];
});
function useSwitchModelMutation() {
    _s12();
    const qc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"])({
        mutationFn: {
            "useSwitchModelMutation.useMutation": (path)=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].switchModel(path)
        }["useSwitchModelMutation.useMutation"],
        onSuccess: {
            "useSwitchModelMutation.useMutation": ()=>{
                qc.invalidateQueries({
                    queryKey: [
                        "axoniz",
                        "config"
                    ]
                });
                qc.invalidateQueries({
                    queryKey: [
                        "axoniz",
                        "health"
                    ]
                });
            }
        }["useSwitchModelMutation.useMutation"]
    });
}
_s12(useSwitchModelMutation, "ec0A66mtyLA0kdwNsMUsaWj/EHM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"]
    ];
});
function useSaveConfigMutation() {
    _s13();
    const qc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"])({
        mutationFn: {
            "useSaveConfigMutation.useMutation": (patch)=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].saveConfig(patch)
        }["useSaveConfigMutation.useMutation"],
        onSuccess: {
            "useSaveConfigMutation.useMutation": ()=>{
                qc.invalidateQueries({
                    queryKey: [
                        "axoniz",
                        "config"
                    ]
                });
            }
        }["useSaveConfigMutation.useMutation"]
    });
}
_s13(useSaveConfigMutation, "ec0A66mtyLA0kdwNsMUsaWj/EHM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"]
    ];
});
function useStartDownloadMutation() {
    _s14();
    const qc = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"])({
        mutationFn: {
            "useStartDownloadMutation.useMutation": ({ repo_id, filename })=>__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].startDownload(repo_id, filename)
        }["useStartDownloadMutation.useMutation"],
        onSuccess: {
            "useStartDownloadMutation.useMutation": ()=>{
                qc.invalidateQueries({
                    queryKey: [
                        "axoniz",
                        "downloads"
                    ]
                });
            }
        }["useStartDownloadMutation.useMutation"]
    });
}
_s14(useStartDownloadMutation, "ec0A66mtyLA0kdwNsMUsaWj/EHM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TopBar",
    ()=>TopBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript) <export default as ChevronLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$power$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Power$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/power.js [app-client] (ecmascript) <export default as Power>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/queries.ts [app-client] (ecmascript)");
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
function TopBar() {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const { sidebarCollapsed, toggleSidebar, activeProvider, activeModel, username, logout, openModelPicker } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])();
    const { data: health } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHealthQuery"])();
    const { data: sysStats } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSystemStatsQuery"])();
    const dataSource = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "TopBar.useAxonizStore[dataSource]": (s)=>s.dataSource
    }["TopBar.useAxonizStore[dataSource]"]);
    const online = health?.status === "active";
    const providerMeta = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].find((p)=>p.id === activeProvider);
    // Build breadcrumb from real Next.js pathname
    const parts = pathname.split("/").filter(Boolean);
    const breadcrumb = parts.length > 0 ? parts.map((p)=>p.length > 22 ? p.slice(0, 22) + "…" : p).join(" / ") : "chat";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "sticky top-0 z-30 flex items-center gap-2 px-4 h-12 border-b border-border bg-background/95 backdrop-blur-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                variant: "ghost",
                size: "icon",
                onClick: toggleSidebar,
                className: "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground",
                children: sidebarCollapsed ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                    className: "w-4 h-4"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                    lineNumber: 44,
                    columnNumber: 29
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__["ChevronLeft"], {
                    className: "w-4 h-4"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                    lineNumber: 44,
                    columnNumber: 68
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                lineNumber: 38,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "w-6 h-6 rounded-md bg-foreground/8 border border-foreground/15 flex items-center justify-center",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-foreground font-mono text-[10px] font-semibold tracking-tighter",
                            children: "AX"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                            lineNumber: 50,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                        lineNumber: 49,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-semibold tracking-tight",
                        children: "AXONIZ"
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                        lineNumber: 52,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                lineNumber: 48,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "ml-2 text-xs text-muted-foreground hidden sm:inline font-mono",
                children: [
                    "/ ",
                    breadcrumb
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: openModelPicker,
                        className: "inline-flex items-center gap-1.5 px-2 h-7 rounded-md border border-border bg-secondary text-secondary-foreground text-[11px] hover:border-foreground/20 transition-colors",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `w-1.5 h-1.5 rounded-full ${online ? "bg-accent" : "bg-muted-foreground"}`
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                lineNumber: 66,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-muted-foreground",
                                children: providerMeta?.name ?? activeProvider
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                lineNumber: 67,
                                columnNumber: 11
                            }, this),
                            activeModel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono text-foreground/80 max-w-[200px] truncate",
                                children: activeModel.length > 22 ? activeModel.slice(0, 22) + "…" : activeModel
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                lineNumber: 69,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                className: "w-3 h-3 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                lineNumber: 73,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                        lineNumber: 62,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipProvider"], {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                    asChild: true,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `inline-flex items-center gap-1.5 px-2 h-6 rounded-md text-[11px] font-mono border ${online ? "border-accent/20 bg-accent/5 text-accent" : "border-border bg-secondary text-muted-foreground"}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `w-1.5 h-1.5 rounded-full ${online ? "bg-accent animate-blink" : "bg-muted-foreground"}`
                                            }, void 0, false, {
                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                                lineNumber: 87,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "hidden sm:inline",
                                                children: online ? "ONLINE" : "OFFLINE"
                                            }, void 0, false, {
                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                                lineNumber: 88,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `ml-1 px-1 py-0.5 rounded text-[9px] uppercase ${dataSource === "live" ? "bg-accent/15 text-accent" : dataSource === "mock" ? "bg-foreground/10 text-foreground" : "bg-secondary text-muted-foreground"}`,
                                                children: dataSource === "unknown" ? "?" : dataSource
                                            }, void 0, false, {
                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                                lineNumber: 89,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                        lineNumber: 80,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                    lineNumber: 79,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                    children: [
                                        "Backend: ",
                                        health?.backend ?? "—",
                                        " · source: ",
                                        dataSource
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                    lineNumber: 98,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                            lineNumber: 78,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                        lineNumber: 77,
                        columnNumber: 9
                    }, this),
                    sysStats?.cpu && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                        variant: "outline",
                        className: "hidden lg:inline-flex border-border bg-secondary text-secondary-foreground text-[11px] font-mono px-2 h-6",
                        children: [
                            "CPU ",
                            Math.round(sysStats.cpu.usage * 100),
                            "%"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                        lineNumber: 104,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 pl-2 ml-1 border-l border-border",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "hidden sm:inline text-xs text-muted-foreground",
                                children: username
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                lineNumber: 111,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                variant: "ghost",
                                size: "icon",
                                onClick: logout,
                                className: "h-8 w-8 text-muted-foreground hover:text-destructive",
                                title: "Sign out",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$power$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Power$3e$__["Power"], {
                                    className: "w-4 h-4"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                    lineNumber: 119,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                                lineNumber: 112,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                        lineNumber: 110,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx",
        lineNumber: 37,
        columnNumber: 5
    }, this);
}
_s(TopBar, "wkEOs4czhPUO6t542lO0/hcnhTY=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHealthQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSystemStatsQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = TopBar;
var _c;
__turbopack_context__.k.register(_c, "TopBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Sidebar",
    ()=>Sidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/message-square.js [app-client] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/bot.js [app-client] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/boxes.js [app-client] (ecmascript) <export default as Boxes>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$anvil$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Anvil$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/anvil.js [app-client] (ecmascript) <export default as Anvil>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$network$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Network$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/network.js [app-client] (ecmascript) <export default as Network>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2d$circuit$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BrainCircuit$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/brain-circuit.js [app-client] (ecmascript) <export default as BrainCircuit>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$git$2d$branch$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__GitBranch$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/git-branch.js [app-client] (ecmascript) <export default as GitBranch>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gauge$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Gauge$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/gauge.js [app-client] (ecmascript) <export default as Gauge>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/activity.js [app-client] (ecmascript) <export default as Activity>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/settings.js [app-client] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
const PRIMARY_NAV = [
    {
        id: "chat",
        label: "Chat",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"],
        href: "/chat"
    },
    {
        id: "agent",
        label: "Agent",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"],
        href: "/agent"
    }
];
const WORKSPACE_NAV = [
    {
        id: "vault",
        label: "Vault",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__["Boxes"],
        href: "/vault"
    },
    {
        id: "forge",
        label: "Forge",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$anvil$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Anvil$3e$__["Anvil"],
        href: "/forge"
    },
    {
        id: "war-room",
        label: "War Room",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$network$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Network$3e$__["Network"],
        href: "/war-room"
    },
    {
        id: "palace",
        label: "Palace",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2d$circuit$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BrainCircuit$3e$__["BrainCircuit"],
        href: "/palace"
    },
    {
        id: "axodex",
        label: "Axodex",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$git$2d$branch$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__GitBranch$3e$__["GitBranch"],
        href: "/axodex"
    },
    {
        id: "search",
        label: "Search",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"],
        href: "/search"
    }
];
const SYSTEM_NAV = [
    {
        id: "benchmarks",
        label: "Benchmarks",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gauge$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Gauge$3e$__["Gauge"],
        href: "/benchmarks"
    },
    {
        id: "system",
        label: "System",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__["Activity"],
        href: "/system"
    },
    {
        id: "settings",
        label: "Settings",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"],
        href: "/settings"
    }
];
const SETTINGS_SUB_NAV = [
    {
        id: "providers",
        label: "Providers",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$network$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Network$3e$__["Network"],
        href: "/settings/providers"
    },
    {
        id: "runtime",
        label: "Runtime",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__["Activity"],
        href: "/settings/runtime"
    },
    {
        id: "authority",
        label: "Authority",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"],
        href: "/settings/authority"
    },
    {
        id: "voice",
        label: "Voice",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"],
        href: "/settings/voice"
    },
    {
        id: "appearance",
        label: "Appearance",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"],
        href: "/settings/appearance"
    },
    {
        id: "session",
        label: "Session",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"],
        href: "/settings/session"
    }
];
function Sidebar() {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const collapsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "Sidebar.useAxonizStore[collapsed]": (s)=>s.sidebarCollapsed
    }["Sidebar.useAxonizStore[collapsed]"]);
    const setSidebarCollapsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "Sidebar.useAxonizStore[setSidebarCollapsed]": (s)=>s.setSidebarCollapsed
    }["Sidebar.useAxonizStore[setSidebarCollapsed]"]);
    // Auto-collapse on smaller viewports.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Sidebar.useEffect": ()=>{
            const mq = window.matchMedia("(max-width: 1024px)");
            const apply = {
                "Sidebar.useEffect.apply": ()=>{
                    if (mq.matches) setSidebarCollapsed(true);
                }
            }["Sidebar.useEffect.apply"];
            apply();
            mq.addEventListener("change", apply);
            return ({
                "Sidebar.useEffect": ()=>mq.removeEventListener("change", apply)
            })["Sidebar.useEffect"];
        }
    }["Sidebar.useEffect"], [
        setSidebarCollapsed
    ]);
    const isActive = (href)=>pathname === href || href !== "/chat" && pathname.startsWith(href);
    const inSettings = pathname.startsWith("/settings");
    const renderItem = (item)=>{
        const active = isActive(item.href);
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipProvider"], {
            delayDuration: 400,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                        asChild: true,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: item.href,
                            className: `group relative flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors w-full
                ${active ? "bg-foreground/5 text-foreground border border-foreground/15" : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                    className: "w-4 h-4 shrink-0"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                                    lineNumber: 85,
                                    columnNumber: 15
                                }, this),
                                !collapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-medium truncate",
                                    children: item.label
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                                    lineNumber: 86,
                                    columnNumber: 30
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                            lineNumber: 78,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                        lineNumber: 77,
                        columnNumber: 11
                    }, this),
                    collapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                        side: "right",
                        children: item.label
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                        lineNumber: 89,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                lineNumber: 76,
                columnNumber: 9
            }, this)
        }, item.id, false, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
            lineNumber: 75,
            columnNumber: 7
        }, this);
    };
    const width = collapsed ? 56 : 224;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "sticky top-12 self-start shrink-0 h-[calc(100vh-3rem)] border-r border-border bg-sidebar overflow-hidden transition-[width] duration-200",
        style: {
            width
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
            className: "flex flex-col gap-3 p-2 h-full",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-0.5",
                    children: PRIMARY_NAV.map(renderItem)
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                    lineNumber: 103,
                    columnNumber: 9
                }, this),
                !collapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-1",
                    children: "Workspace"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                    lineNumber: 108,
                    columnNumber: 11
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-0.5",
                    children: WORKSPACE_NAV.map(renderItem)
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                    lineNumber: 112,
                    columnNumber: 9
                }, this),
                !collapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-1",
                    children: "System"
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                    lineNumber: 117,
                    columnNumber: 11
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col gap-0.5",
                    children: SYSTEM_NAV.map(renderItem)
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                    lineNumber: 121,
                    columnNumber: 9
                }, this),
                inSettings && !collapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-1 border-t border-border pt-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1",
                            children: "Settings"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                            lineNumber: 128,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col gap-0.5",
                            children: SETTINGS_SUB_NAV.map((item)=>{
                                const active = isActive(item.href) || pathname === item.href;
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: item.href,
                                    className: `flex items-center gap-2 pl-5 pr-2.5 h-7 rounded-md text-[12px] transition-colors ${active ? "bg-foreground/5 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            className: "w-3 h-3 shrink-0"
                                        }, void 0, false, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                                            lineNumber: 144,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            children: item.label
                                        }, void 0, false, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                                            lineNumber: 145,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, item.id, true, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                                    lineNumber: 135,
                                    columnNumber: 19
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                            lineNumber: 131,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                    lineNumber: 127,
                    columnNumber: 11
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-auto pt-2 border-t border-border",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-2.5 py-1 text-[10px] text-muted-foreground/50 font-mono",
                        children: !collapsed ? "v0.3.1" : ""
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                        lineNumber: 154,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
                    lineNumber: 153,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
            lineNumber: 102,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx",
        lineNumber: 98,
        columnNumber: 5
    }, this);
}
_s(Sidebar, "sre2uzQQZGXo9qs/8wK2I54oo5g=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = Sidebar;
var _c;
__turbopack_context__.k.register(_c, "Sidebar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ScrollArea",
    ()=>ScrollArea,
    "ScrollBar",
    ()=>ScrollBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$scroll$2d$area$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-scroll-area/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-client] (ecmascript)");
"use client";
;
;
;
function ScrollArea({ className, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$scroll$2d$area$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"], {
        "data-slot": "scroll-area",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("relative", className),
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$scroll$2d$area$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Viewport"], {
                "data-slot": "scroll-area-viewport",
                className: "focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1",
                children: children
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ScrollBar, {}, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx",
                lineNumber: 25,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$scroll$2d$area$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Corner"], {}, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx",
                lineNumber: 26,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
_c = ScrollArea;
function ScrollBar({ className, orientation = "vertical", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$scroll$2d$area$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollAreaScrollbar"], {
        "data-slot": "scroll-area-scrollbar",
        orientation: orientation,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex touch-none p-px transition-colors select-none", orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent", orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent", className),
        ...props,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$scroll$2d$area$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollAreaThumb"], {
            "data-slot": "scroll-area-thumb",
            className: "bg-border relative flex-1 rounded-full"
        }, void 0, false, {
            fileName: "[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx",
            lineNumber: 50,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx",
        lineNumber: 37,
        columnNumber: 5
    }, this);
}
_c1 = ScrollBar;
;
var _c, _c1;
__turbopack_context__.k.register(_c, "ScrollArea");
__turbopack_context__.k.register(_c1, "ScrollBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EventRail",
    ()=>EventRail
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/wrench.js [app-client] (ecmascript) <export default as Wrench>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/brain.js [app-client] (ecmascript) <export default as Brain>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/cpu.js [app-client] (ecmascript) <export default as Cpu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/triangle-alert.js [app-client] (ecmascript) <export default as AlertTriangle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-client] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript) <export default as ChevronLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$terminal$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Terminal$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/terminal.js [app-client] (ecmascript) <export default as Terminal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/axoniz/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
function EventRail() {
    _s();
    const [events, setEvents] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [collapsed, setCollapsed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const idRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const dataSource = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "EventRail.useAxonizStore[dataSource]": (s)=>s.dataSource
    }["EventRail.useAxonizStore[dataSource]"]);
    const setDataSource = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "EventRail.useAxonizStore[setDataSource]": (s)=>s.setDataSource
    }["EventRail.useAxonizStore[setDataSource]"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EventRail.useEffect": ()=>{
            let cancelled = false;
            let es = null;
            async function start() {
                const url = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].streamUrl();
                es = new EventSource(url);
                const pushEvent = {
                    "EventRail.useEffect.start.pushEvent": (ev)=>{
                        if (cancelled) return;
                        setEvents({
                            "EventRail.useEffect.start.pushEvent": (prev)=>{
                                const next = [
                                    ...prev,
                                    {
                                        id: ++idRef.current,
                                        ev
                                    }
                                ];
                                return next.slice(-80);
                            }
                        }["EventRail.useEffect.start.pushEvent"]);
                    }
                }["EventRail.useEffect.start.pushEvent"];
                const handle = {
                    "EventRail.useEffect.start.handle": (type)=>({
                            "EventRail.useEffect.start.handle": (e)=>{
                                try {
                                    const data = JSON.parse(e.data);
                                    pushEvent({
                                        type,
                                        ...data,
                                        ts: data.ts ?? Date.now() / 1000
                                    });
                                } catch  {
                                /* ignore */ }
                            }
                        })["EventRail.useEffect.start.handle"]
                }["EventRail.useEffect.start.handle"];
                const types = [
                    "token",
                    "tool_call",
                    "tool_result",
                    "thought",
                    "swarm",
                    "memory",
                    "error",
                    "done",
                    "health"
                ];
                types.forEach({
                    "EventRail.useEffect.start": (t)=>es?.addEventListener(t, handle(t))
                }["EventRail.useEffect.start"]);
                es.addEventListener("message", handle("message"));
                es.onerror = ({
                    "EventRail.useEffect.start": ()=>{
                    /* EventSource auto-reconnects */ }
                })["EventRail.useEffect.start"];
            }
            void ({
                "EventRail.useEffect": async ()=>{
                    try {
                        await start();
                    } catch  {
                    /* swallow */ }
                }
            })["EventRail.useEffect"]();
            return ({
                "EventRail.useEffect": ()=>{
                    cancelled = true;
                    es?.close();
                }
            })["EventRail.useEffect"];
        }
    }["EventRail.useEffect"], []);
    // Pull source tag once.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "EventRail.useEffect": ()=>{
            let cancelled = false;
            ({
                "EventRail.useEffect": async ()=>{
                    try {
                        const r = await fetch(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].streamUrl(), {
                            method: "GET"
                        });
                        const src = r.headers.get("x-axoniz-source");
                        if (!cancelled && src) {
                            setDataSource(src);
                        }
                    } catch  {
                    /* ignore */ }
                }
            })["EventRail.useEffect"]();
            return ({
                "EventRail.useEffect": ()=>{
                    cancelled = true;
                }
            })["EventRail.useEffect"];
        }
    }["EventRail.useEffect"], [
        setDataSource
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "hidden lg:flex sticky top-12 self-start h-[calc(100vh-3rem)] border-l border-border bg-sidebar flex-col transition-[width] duration-200",
        style: {
            width: collapsed ? 32 : 288
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between px-3 h-9 border-b border-border shrink-0",
                children: [
                    !collapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$terminal$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Terminal$3e$__["Terminal"], {
                                className: "w-3 h-3"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                                lineNumber: 110,
                                columnNumber: 13
                            }, this),
                            "Event Stream",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `ml-1 px-1 py-0.5 rounded text-[9px] uppercase font-mono ${dataSource === "live" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`,
                                children: dataSource === "live" ? "LIVE" : "DEMO"
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                                lineNumber: 112,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                        lineNumber: 109,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "ghost",
                        size: "icon",
                        onClick: ()=>setCollapsed((c)=>!c),
                        className: "h-7 w-7 text-muted-foreground hover:text-foreground",
                        children: collapsed ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__["ChevronLeft"], {
                            className: "w-3.5 h-3.5"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                            lineNumber: 130,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                            className: "w-3.5 h-3.5"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                            lineNumber: 132,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                        lineNumber: 123,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                lineNumber: 107,
                columnNumber: 7
            }, this),
            !collapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
                className: "flex-1 min-h-0",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "p-1.5 space-y-1",
                    children: [
                        events.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-[11px] text-muted-foreground/60 p-3 text-center",
                            children: "Connecting…"
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                            lineNumber: 141,
                            columnNumber: 15
                        }, this),
                        events.map(({ id, ev })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(EventRow, {
                                ev: ev
                            }, id, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                                lineNumber: 146,
                                columnNumber: 15
                            }, this))
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                    lineNumber: 139,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                lineNumber: 138,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
        lineNumber: 103,
        columnNumber: 5
    }, this);
}
_s(EventRail, "u0BGIF7FJJqWnL2HVheRnTuSdfE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = EventRail;
function EventRow({ ev }) {
    const cfg = rowConfig(ev);
    const Icon = cfg.icon;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded px-2.5 py-1.5 hover:bg-secondary/60 transition-colors",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-start gap-2",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                    className: `w-3 h-3 mt-0.5 shrink-0 ${cfg.color}`
                }, void 0, false, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                    lineNumber: 161,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "min-w-0 flex-1",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-between gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium",
                                    children: cfg.label
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                                    lineNumber: 164,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-[9px] text-muted-foreground/50 font-mono",
                                    children: new Date((ev.ts ?? Date.now() / 1000) * 1000).toLocaleTimeString()
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                                    lineNumber: 167,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                            lineNumber: 163,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-[11px] text-foreground/80 break-words leading-snug mt-0.5",
                            children: cfg.body
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                            lineNumber: 171,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
                    lineNumber: 162,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
            lineNumber: 160,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx",
        lineNumber: 159,
        columnNumber: 5
    }, this);
}
_c1 = EventRow;
function rowConfig(ev) {
    switch(ev.type){
        case "token":
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__["Cpu"],
                label: "Token",
                body: ev.value ?? "",
                color: "text-primary"
            };
        case "tool_call":
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__["Wrench"],
                label: "Tool call",
                body: ev.tool ?? "",
                color: "text-accent"
            };
        case "tool_result":
            return {
                icon: ev.success ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"] : __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"],
                label: "Result",
                body: ev.result ?? "",
                color: ev.success ? "text-accent" : "text-destructive"
            };
        case "thought":
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__["Brain"],
                label: "Thought",
                body: ev.value ?? "",
                color: "text-muted-foreground"
            };
        case "swarm":
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__["Cpu"],
                label: `Swarm · ${ev.phase ?? ""}`,
                body: ev.detail ?? ev.status ?? "",
                color: "text-primary"
            };
        case "memory":
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__["Brain"],
                label: `Memory · ${ev.action ?? ""}`,
                body: ev.key ?? "",
                color: "text-accent"
            };
        case "error":
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"],
                label: "Error",
                body: ev.error ?? "",
                color: "text-destructive"
            };
        case "done":
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"],
                label: "Done",
                body: ev.summary ?? "Task complete",
                color: "text-accent"
            };
        default:
            return {
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$terminal$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Terminal$3e$__["Terminal"],
                label: ev.type,
                body: JSON.stringify(ev).slice(0, 80),
                color: "text-muted-foreground"
            };
    }
}
var _c, _c1;
__turbopack_context__.k.register(_c, "EventRail");
__turbopack_context__.k.register(_c1, "EventRow");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ModelPicker",
    ()=>ModelPicker
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$server$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Server$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/server.js [app-client] (ecmascript) <export default as Server>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/cpu.js [app-client] (ecmascript) <export default as Cpu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cloud$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cloud$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/cloud.js [app-client] (ecmascript) <export default as Cloud>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/axoniz/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
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
function ModelPicker() {
    _s();
    const { closeModelPicker, pickModel, activeProvider, activeModel, providers, setProvider } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])();
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [tests, setTests] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({});
    const [selectedProvider, setSelectedProvider] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(activeProvider);
    // Auto-test the selected provider when user opens picker or switches provider.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ModelPicker.useEffect": ()=>{
            const cfg = providers[selectedProvider];
            const meta = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].find({
                "ModelPicker.useEffect.meta": (p)=>p.id === selectedProvider
            }["ModelPicker.useEffect.meta"]);
            if (!cfg.baseUrl && meta.category === "cloud") return;
            if (meta.needsApiKey && !cfg.apiKey) return;
            if (tests[selectedProvider]?.status === "loading" || tests[selectedProvider]?.status === "ok") return;
            runTest(selectedProvider);
        }
    }["ModelPicker.useEffect"], [
        selectedProvider
    ]);
    async function runTest(id) {
        const cfg = providers[id];
        const meta = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].find((p)=>p.id === id);
        setTests((t)=>({
                ...t,
                [id]: {
                    status: "loading",
                    models: []
                }
            }));
        try {
            const result = await __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["axonizClient"].testProvider({
                provider: id,
                baseUrl: cfg.baseUrl || meta.defaultBaseUrl,
                apiKey: cfg.apiKey || undefined
            });
            setTests((t)=>({
                    ...t,
                    [id]: {
                        status: result.ok ? "ok" : "error",
                        latencyMs: result.latencyMs,
                        models: result.models,
                        error: result.error
                    }
                }));
        } catch (err) {
            setTests((t)=>({
                    ...t,
                    [id]: {
                        status: "error",
                        models: [],
                        error: err instanceof Error ? err.message : "Test failed"
                    }
                }));
        }
    }
    const test = tests[selectedProvider];
    const meta = __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].find((p)=>p.id === selectedProvider);
    const cfg = providers[selectedProvider];
    const filtered = (test?.models ?? []).filter((m)=>m.id.toLowerCase().includes(query.toLowerCase()));
    const popular = meta.popularModels.filter((m)=>m.toLowerCase().includes(query.toLowerCase()));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-50 flex items-start justify-center pt-[10vh] p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0 bg-black/60",
                onClick: closeModelPicker
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                lineNumber: 94,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative w-full max-w-3xl surface-elevated rounded-lg overflow-hidden flex flex-col",
                style: {
                    maxHeight: "80vh"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-4 py-3 border-b border-border flex items-center justify-between",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$server$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Server$3e$__["Server"], {
                                        className: "w-4 h-4"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                        lineNumber: 99,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-sm font-medium",
                                        children: "Select model"
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                        lineNumber: 100,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 98,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: closeModelPicker,
                                className: "text-muted-foreground hover:text-foreground h-7 w-7 rounded flex items-center justify-center hover:bg-secondary",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    className: "w-4 h-4"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                    lineNumber: 106,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 102,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 flex-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "w-48 border-r border-border overflow-y-auto",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "p-2 space-y-0.5",
                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PROVIDER_CATALOG"].map((p)=>{
                                        const t = tests[p.id];
                                        const isLocal = p.category === "local";
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>setSelectedProvider(p.id),
                                            className: `w-full flex items-center gap-2 px-2 h-8 rounded-md text-[12px] transition-colors ${selectedProvider === p.id ? "bg-foreground/5 text-foreground border border-foreground/15" : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"}`,
                                            children: [
                                                isLocal ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__["Cpu"], {
                                                    className: "w-3 h-3 shrink-0"
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 127,
                                                    columnNumber: 32
                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cloud$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cloud$3e$__["Cloud"], {
                                                    className: "w-3 h-3 shrink-0"
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 127,
                                                    columnNumber: 71
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "truncate flex-1 text-left",
                                                    children: p.name
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 128,
                                                    columnNumber: 21
                                                }, this),
                                                t?.status === "ok" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "w-1.5 h-1.5 rounded-full bg-accent"
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 130,
                                                    columnNumber: 23
                                                }, this),
                                                t?.status === "error" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "w-1.5 h-1.5 rounded-full bg-destructive"
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 133,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, p.id, true, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                            lineNumber: 118,
                                            columnNumber: 19
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                    lineNumber: 113,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 112,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 flex flex-col min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "p-3 border-b border-border",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "relative",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                                        className: "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                                                    }, void 0, false, {
                                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                        lineNumber: 146,
                                                        columnNumber: 17
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                                        value: query,
                                                        onChange: (e)=>setQuery(e.target.value),
                                                        placeholder: "Search models…",
                                                        className: "h-8 pl-8 bg-input border-border text-[13px]"
                                                    }, void 0, false, {
                                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                        lineNumber: 147,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                lineNumber: 145,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-2 flex items-center gap-2 text-[11px] text-muted-foreground",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                        variant: "outline",
                                                        className: "font-mono text-[10px] border-border bg-secondary text-secondary-foreground",
                                                        children: meta.name
                                                    }, void 0, false, {
                                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                        lineNumber: 156,
                                                        columnNumber: 17
                                                    }, this),
                                                    cfg.baseUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "font-mono truncate",
                                                        children: cfg.baseUrl
                                                    }, void 0, false, {
                                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                        lineNumber: 160,
                                                        columnNumber: 19
                                                    }, this),
                                                    test?.status === "ok" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                        variant: "outline",
                                                        className: "ml-auto font-mono text-[10px] border-accent/20 bg-accent/5 text-accent",
                                                        children: [
                                                            test.latencyMs,
                                                            "ms · ",
                                                            test.models.length,
                                                            " models"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                        lineNumber: 163,
                                                        columnNumber: 19
                                                    }, this),
                                                    test?.status === "error" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                        variant: "outline",
                                                        className: "ml-auto font-mono text-[10px] border-destructive/20 bg-destructive/5 text-destructive",
                                                        children: test.error?.slice(0, 30) ?? "Error"
                                                    }, void 0, false, {
                                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                        lineNumber: 168,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                lineNumber: 155,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                        lineNumber: 144,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
                                        className: "flex-1 min-h-0",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "p-2",
                                            children: [
                                                test?.status === "loading" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center justify-center py-12 text-muted-foreground text-xs gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                            className: "w-4 h-4 animate-spin"
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                            lineNumber: 180,
                                                            columnNumber: 21
                                                        }, this),
                                                        "Pinging ",
                                                        meta.name,
                                                        "…"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 179,
                                                    columnNumber: 19
                                                }, this),
                                                test?.status === "error" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "p-4",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive font-mono break-words",
                                                            children: test.error
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                            lineNumber: 186,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>runTest(selectedProvider),
                                                            className: "mt-2 text-[11px] text-muted-foreground hover:text-foreground underline",
                                                            children: "Configure in Settings →"
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                            lineNumber: 189,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 185,
                                                    columnNumber: 19
                                                }, this),
                                                test?.status === "ok" && filtered.length === 0 && query && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-center text-xs text-muted-foreground py-8",
                                                    children: [
                                                        'No models matching "',
                                                        query,
                                                        '".'
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 198,
                                                    columnNumber: 19
                                                }, this),
                                                test?.status === "ok" && filtered.length === 0 && !query && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-center text-xs text-muted-foreground py-8",
                                                    children: "No models returned. Verify the server is running and has models loaded."
                                                }, void 0, false, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 203,
                                                    columnNumber: 19
                                                }, this),
                                                test?.status !== "ok" && test?.status !== "loading" && popular.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground",
                                                            children: "Popular models"
                                                        }, void 0, false, {
                                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                            lineNumber: 211,
                                                            columnNumber: 21
                                                        }, this),
                                                        popular.map((m)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ModelRow, {
                                                                id: m,
                                                                active: m === activeModel && selectedProvider === activeProvider,
                                                                hint: "configure to verify",
                                                                onClick: ()=>{
                                                                    setProvider(selectedProvider, {
                                                                        model: m,
                                                                        baseUrl: cfg.baseUrl || meta.defaultBaseUrl
                                                                    });
                                                                    pickModel(selectedProvider, m);
                                                                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(`Switched to ${meta.name} · ${m}`, {
                                                                        description: "Save config in Settings to verify the endpoint."
                                                                    });
                                                                }
                                                            }, m, false, {
                                                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                                lineNumber: 215,
                                                                columnNumber: 23
                                                            }, this))
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                    lineNumber: 210,
                                                    columnNumber: 19
                                                }, this),
                                                test?.status === "ok" && filtered.map((m)=>{
                                                    const isActiveModel = m.id === activeModel && selectedProvider === activeProvider;
                                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ModelRow, {
                                                        id: m.id,
                                                        active: isActiveModel,
                                                        contextLength: m.contextLength,
                                                        pricing: m.pricing,
                                                        onClick: ()=>{
                                                            setProvider(selectedProvider, {
                                                                model: m.id,
                                                                baseUrl: cfg.baseUrl || meta.defaultBaseUrl
                                                            });
                                                            pickModel(selectedProvider, m.id);
                                                        }
                                                    }, m.id, false, {
                                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                                        lineNumber: 236,
                                                        columnNumber: 21
                                                    }, this);
                                                })
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                            lineNumber: 177,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                        lineNumber: 176,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 142,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                        lineNumber: 110,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                lineNumber: 95,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
        lineNumber: 93,
        columnNumber: 5
    }, this);
}
_s(ModelPicker, "egFZ4QEFTc5TipTFD4KfK6LDxog=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"]
    ];
});
_c = ModelPicker;
function ModelRow({ id, active, contextLength, pricing, hint, onClick }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        onClick: onClick,
        className: `w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${active ? "bg-foreground/5" : "hover:bg-secondary"}`,
        children: [
            active ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                className: "w-3.5 h-3.5 text-foreground shrink-0"
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                lineNumber: 281,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-3.5 h-3.5 shrink-0"
            }, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                lineNumber: 283,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-w-0 flex-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "font-mono text-[12px] text-foreground/90 truncate",
                        children: id
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                        lineNumber: 286,
                        columnNumber: 9
                    }, this),
                    (contextLength || pricing || hint) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-[10px] text-muted-foreground/70 mt-0.5",
                        children: [
                            contextLength && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono",
                                children: [
                                    Math.round(contextLength / 1024),
                                    "K ctx"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 290,
                                columnNumber: 15
                            }, this),
                            pricing?.prompt !== undefined && pricing.prompt > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono",
                                children: [
                                    "$",
                                    pricing.prompt.toFixed(2),
                                    "/MTok in"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 293,
                                columnNumber: 15
                            }, this),
                            pricing?.completion !== undefined && pricing.completion > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono",
                                children: [
                                    "$",
                                    pricing.completion.toFixed(2),
                                    "/MTok out"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 296,
                                columnNumber: 15
                            }, this),
                            hint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: hint
                            }, void 0, false, {
                                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                                lineNumber: 298,
                                columnNumber: 22
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                        lineNumber: 288,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
                lineNumber: 285,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx",
        lineNumber: 274,
        columnNumber: 5
    }, this);
}
_c1 = ModelRow;
var _c, _c1;
__turbopack_context__.k.register(_c, "ModelPicker");
__turbopack_context__.k.register(_c1, "ModelRow");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/components/axoniz/boot.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAxonizBoot",
    ()=>useAxonizBoot
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/queries.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function useAxonizBoot() {
    _s();
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "useAxonizBoot.useAxonizStore[token]": (s)=>s.token
    }["useAxonizBoot.useAxonizStore[token]"]);
    const setActiveModel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "useAxonizBoot.useAxonizStore[setActiveModel]": (s)=>s.setActiveModel
    }["useAxonizBoot.useAxonizStore[setActiveModel]"]);
    const setDataSource = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "useAxonizBoot.useAxonizStore[setDataSource]": (s)=>s.setDataSource
    }["useAxonizBoot.useAxonizStore[setDataSource]"]);
    const healthQ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHealthQuery"])();
    const configQ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useConfigQuery"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAxonizBoot.useEffect": ()=>{
            if (!token) return;
            // Watch config for the active model
            if (configQ.data?.llm?.model) {
                setActiveModel(configQ.data.llm.model);
            }
        }
    }["useAxonizBoot.useEffect"], [
        token,
        configQ.data,
        setActiveModel
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAxonizBoot.useEffect": ()=>{
            if (!token) return;
            // Use the source tag we attach via the proxy route.
            void ({
                "useAxonizBoot.useEffect": async ()=>{
                    try {
                        const r = await fetch("/api/axoniz/health");
                        const src = r.headers.get("x-axoniz-source");
                        if (src === "live" || src === "mock") setDataSource(src);
                    } catch  {
                    /* ignore */ }
                }
            })["useAxonizBoot.useEffect"]();
        }
    }["useAxonizBoot.useEffect"], [
        token,
        setDataSource,
        healthQ.dataUpdatedAt
    ]);
}
_s(useAxonizBoot, "3/2ZPG2FJY9sNsBYx7g+33SxL/8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useHealthQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useConfigQuery"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AuthLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$login$2d$screen$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$top$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/top-bar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/sidebar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$event$2d$rail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/event-rail.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$model$2d$picker$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/model-picker.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$boot$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/boot.ts [app-client] (ecmascript)");
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
function AuthLayout({ children }) {
    _s();
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "AuthLayout.useAxonizStore[token]": (s)=>s.token
    }["AuthLayout.useAxonizStore[token]"]);
    const modelPickerOpen = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"])({
        "AuthLayout.useAxonizStore[modelPickerOpen]": (s)=>s.modelPickerOpen
    }["AuthLayout.useAxonizStore[modelPickerOpen]"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$boot$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizBoot"])();
    if (!token) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$login$2d$screen$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LoginScreen"], {}, void 0, false, {
            fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
            lineNumber: 34,
            columnNumber: 12
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-screen flex flex-col bg-background",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$top$2d$bar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TopBar"], {}, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 flex min-h-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sidebar"], {}, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                        className: "flex-1 min-w-0 min-h-[calc(100vh-3rem)] overflow-hidden bg-background",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-full animate-fade-in",
                            children: children
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                            lineNumber: 43,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$event$2d$rail$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EventRail"], {}, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
                className: "mt-auto border-t border-border bg-background py-2 px-4 flex items-center justify-between text-[11px] text-muted-foreground/70",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "© 2026 Akik Faraji — Fraziym Tech & AI"
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "hidden sm:inline font-mono",
                        children: "AXONIZ v0.3.2"
                    }, void 0, false, {
                        fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                        lineNumber: 49,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            modelPickerOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$model$2d$picker$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ModelPicker"], {}, void 0, false, {
                fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
                lineNumber: 51,
                columnNumber: 27
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/AXONIZ/web-next/src/app/(auth)/layout.tsx",
        lineNumber: 38,
        columnNumber: 5
    }, this);
}
_s(AuthLayout, "wuECGU2Quey8XvDkGgbTxiV/mC8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$boot$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAxonizBoot"]
    ];
});
_c = AuthLayout;
var _c;
__turbopack_context__.k.register(_c, "AuthLayout");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=AXONIZ_web-next_src_0a94b9ab._.js.map