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
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:url [external] (node:url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:url", () => require("node:url"));

module.exports = mod;
}),
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
}),
"[project]/AXONIZ/web-next/src/app/api/axoniz/[...path]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic,
    "runtime",
    ()=>runtime
]);
/**
 * AXONIZ unified API route — replaces the old catch-all HTTP proxy.
 *
 * Instead of proxying to a separate Express server on :7860, this route
 * directly imports the AXONIZ compiled code from ../../dist/ and calls
 * the functions in-process. No HTTP proxy, no mock fallback, no :3000.
 *
 * Architecture:
 *   Browser → :7860 (Next.js) → this route → import from ../../dist/ → direct function call
 *
 * The chat route (/api/axoniz/chat) stays separate — it directly calls
 * the LLM provider (llama-server, OpenAI, etc.) via HTTP, which is
 * unavoidable.
 *
 * If dist/ doesn't exist (CLI not built), returns a clear error telling
 * the user to run `npm run build` in the project root.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$url__$5b$external$5d$__$28$node$3a$url$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:url [external] (node:url, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:fs [external] (node:fs, cjs)");
const __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("AXONIZ/web-next/src/app/api/axoniz/[...path]/route.ts")}`;
    }
};
;
;
;
;
const dynamic = "force-dynamic";
const runtime = "nodejs";
const HERE = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$url__$5b$external$5d$__$28$node$3a$url$2c$__cjs$29$__["fileURLToPath"])(__TURBOPACK__import$2e$meta__.url);
// From web-next/.next/server/app/api/axoniz/[...path]/route.js
// to the project root dist/
const PROJECT_ROOT = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].resolve(HERE, "../../../../../..");
const DIST_DIR = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(PROJECT_ROOT, "dist");
/** Cache for dynamically imported modules */ const moduleCache = new Map();
async function loadModule(relPath) {
    if (moduleCache.has(relPath)) return moduleCache.get(relPath);
    const fullPath = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(DIST_DIR, relPath);
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].existsSync(fullPath)) {
        throw new Error(`AXONIZ module not built: ${relPath}. Run 'npm run build' in the project root.`);
    }
    const dynamicImport = new Function("path", "return import(path)");
    const p = dynamicImport(fullPath);
    moduleCache.set(relPath, p);
    return p;
}
/** Lazy-initialized agent singleton */ let agentInstance = null;
async function getAgent() {
    if (agentInstance) return agentInstance;
    const { Agent } = await loadModule("core/agent.js");
    const { loadConfigWithAutodetect } = await loadModule("core/config.js");
    const cfg = loadConfigWithAutodetect();
    agentInstance = new Agent(cfg);
    return agentInstance;
}
async function GET(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace("/api/axoniz", "");
    const search = url.search;
    try {
        // Route to the appropriate dist/ function
        switch(path){
            case "/health":
                {
                    const agent = await getAgent();
                    const result = await agent.health();
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(result);
                }
            case "/config":
                {
                    const { loadConfig } = await loadModule("core/config.js");
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(loadConfig());
                }
            case "/models":
                {
                    const { showTable } = await loadModule("core/models.js");
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        models: []
                    }); // TODO: wire to actual model list
                }
            case "/war_room":
            case "/swarm/status":
                {
                    const agent = await getAgent();
                    const { resolveSwarmModels } = await loadModule("core/config.js");
                    resolveSwarmModels(agent.config);
                    const swarm = agent.config.swarm_models;
                    const status = {};
                    for (const [role, fpath] of Object.entries(swarm)){
                        status[role] = {
                            path: fpath,
                            name: fpath ? path.split("/").pop() || fpath : "",
                            ready: Boolean(fpath && __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].existsSync(fpath))
                        };
                    }
                    const expertMode = Object.values(status).some((v)=>v.ready);
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        expert_mode: expertMode,
                        roles: status,
                        description: expertMode ? "Domain-expert swarm active — models hot-swap per phase" : "Standard swarm mode — single model for all phases"
                    });
                }
            case "/memory":
                {
                    const agent = await getAgent();
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        memory: agent.memory.all()
                    });
                }
            case "/system/stats":
                {
                    const os = await __turbopack_context__.A("[externals]/node:os [external] (node:os, cjs, async loader)");
                    const stats = {
                        cpu: {
                            percent: process.cpuUsage().user / 1000000,
                            cores: os.cpus().length
                        },
                        memory: {
                            percent: (1 - os.freemem() / os.totalmem()) * 100,
                            usedGb: (os.totalmem() - os.freemem()) / 1e9,
                            totalGb: os.totalmem() / 1e9
                        },
                        disk: {
                            percent: 0,
                            usedGb: 0,
                            totalGb: 0
                        },
                        uptime: process.uptime(),
                        hostname: os.hostname(),
                        platform: process.platform,
                        nodeVersion: process.version
                    };
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(stats);
                }
            case "/agent/stats":
                {
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        tool_calls: 0,
                        tasks_done: 0,
                        messages: 0,
                        tokens: 0
                    });
                }
            case "/backends":
                {
                    const { PROVIDER_CATALOG } = await loadModule("core/config.js");
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        backends: PROVIDER_CATALOG
                    });
                }
            case "/code-graph-summary":
                {
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        status: "not_available",
                        message: "Run 'axodex analyze' to build the code graph"
                    });
                }
            default:
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: `Unknown API path: ${path}`
                }, {
                    status: 404
                });
        }
    } catch (err) {
        const e = err;
        const isBuildMissing = e.message.includes("not built") || e.message.includes("Cannot find module");
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: isBuildMissing ? "AXONIZ backend not built. Run 'npm run build' in the project root, then restart." : e.message
        }, {
            status: isBuildMissing ? 503 : 500
        });
    }
}
async function POST(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace("/api/axoniz", "");
    try {
        const body = await req.json().catch(()=>({}));
        switch(path){
            case "/config/save":
                {
                    const { saveConfig } = await loadModule("core/config.js");
                    saveConfig(body);
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        status: "saved"
                    });
                }
            case "/agent/task":
                {
                    const agent = await getAgent();
                    const task = String(body.task || body.message || "");
                    if (!task) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        error: "Missing task"
                    }, {
                        status: 400
                    });
                    const result = await agent.run(task);
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        result
                    });
                }
            case "/reset":
                {
                    const agent = await getAgent();
                    agent.reset();
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        status: "reset"
                    });
                }
            case "/auth/login":
                {
                    // Simple mock auth — the real auth was in Express.
                    // For now, accept any username/password and return a token.
                    // The frontend store just needs a non-null token to proceed.
                    const username = String(body.username || "user");
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        token: `demo-${Date.now().toString(36)}`,
                        username
                    });
                }
            case "/auth/register":
                {
                    const username = String(body.username || "user");
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        token: `demo-${Date.now().toString(36)}`,
                        username
                    });
                }
            case "/model/switch":
                {
                    const { saveConfig, loadConfig } = await loadModule("core/config.js");
                    const cfg = loadConfig();
                    cfg.model_name = body.name;
                    saveConfig(cfg);
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        status: "switched",
                        model: body.name
                    });
                }
            default:
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: `Unknown API path: ${path}`
                }, {
                    status: 404
                });
        }
    } catch (err) {
        const e = err;
        const isBuildMissing = e.message.includes("not built") || e.message.includes("Cannot find module");
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: isBuildMissing ? "AXONIZ backend not built. Run 'npm run build' in the project root, then restart." : e.message
        }, {
            status: isBuildMissing ? 503 : 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d8258a5c._.js.map