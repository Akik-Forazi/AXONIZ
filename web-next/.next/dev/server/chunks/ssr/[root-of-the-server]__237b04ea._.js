module.exports = [
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

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
"[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_PROVIDERS",
    ()=>DEFAULT_PROVIDERS,
    "PROVIDER_CATALOG",
    ()=>PROVIDER_CATALOG,
    "useAxonizStore",
    ()=>useAxonizStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-ssr] (ecmascript)");
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
const DEFAULT_PROVIDERS = Object.fromEntries(PROVIDER_CATALOG.map((p)=>[
        p.id,
        {
            enabled: p.id === "llamacpp",
            baseUrl: p.defaultBaseUrl,
            apiKey: "",
            model: p.popularModels[0] ?? ""
        }
    ]));
const DEFAULT_LLAMACPP = {
    modelPath: "~/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    nCtx: 8192,
    nGpuLayers: 0,
    nThreads: 8
};
const useAxonizStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
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
    storage: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createJSONStorage"])(()=>localStorage),
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
}),
"[project]/AXONIZ/web-next/src/components/ui/button.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button,
    "buttonVariants",
    ()=>buttonVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cva"])("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", {
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
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Slot"] : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "button",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
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
;
}),
"[project]/AXONIZ/web-next/src/components/ui/input.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Input",
    ()=>Input
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
function Input({ className, type, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        type: type,
        "data-slot": "input",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/input.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/AXONIZ/web-next/src/components/ui/label.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Label",
    ()=>Label
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-label/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function Label({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"], {
        "data-slot": "label",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/components/ui/label.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/AXONIZ/web-next/src/lib/axoniz/client.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LoginScreen",
    ()=>LoginScreen
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/input.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/ui/label.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/lib/axoniz/client.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-ssr] (ecmascript)");
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
function LoginScreen() {
    const [username, setUsername] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("axoniz");
    const [password, setPassword] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const setAuth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAxonizStore"])((s)=>s.setAuth);
    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        if (!username || password.length < 4) {
            setError("Username and a password (min 4 chars) are required.");
            return;
        }
        setLoading(true);
        try {
            const res = await __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$lib$2f$axoniz$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["axonizClient"].login({
                username,
                password
            });
            if ("error" in res) {
                setError(res.error);
                setLoading(false);
                return;
            }
            setAuth(res.token, res.username);
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toast"].success(`Welcome, ${res.username}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
            setLoading(false);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-screen flex items-center justify-center p-6",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "w-full max-w-sm animate-fade-in",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-7 text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "inline-flex items-center gap-2.5 mb-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "w-7 h-7 rounded-md bg-foreground/8 border border-foreground/15 flex items-center justify-center",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                    onSubmit: onSubmit,
                    className: "surface rounded-lg p-6 space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    htmlFor: "username",
                                    className: "text-xs font-medium text-muted-foreground",
                                    children: "Username"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 80,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    htmlFor: "password",
                                    className: "text-xs font-medium text-muted-foreground",
                                    children: "Password"
                                }, void 0, false, {
                                    fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                                    lineNumber: 95,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
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
                        error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive",
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx",
                            lineNumber: 111,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            type: "submit",
                            disabled: loading,
                            className: "w-full h-9 text-sm font-medium",
                            children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-[11px] text-muted-foreground/60 text-center mt-5 leading-relaxed",
                    children: [
                        "Auth is handled by the AXONIZ backend (bcrypt + JWT).",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
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
}),
"[project]/AXONIZ/web-next/src/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/stores/axoniz-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$login$2d$screen$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/AXONIZ/web-next/src/components/axoniz/login-screen.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
function Home() {
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$stores$2f$axoniz$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAxonizStore"])((s)=>s.token);
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (token) router.replace("/chat");
    }, [
        token,
        router
    ]);
    if (!token) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$AXONIZ$2f$web$2d$next$2f$src$2f$components$2f$axoniz$2f$login$2d$screen$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LoginScreen"], {}, void 0, false, {
        fileName: "[project]/AXONIZ/web-next/src/app/page.tsx",
        lineNumber: 16,
        columnNumber: 22
    }, this);
    return null;
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__237b04ea._.js.map