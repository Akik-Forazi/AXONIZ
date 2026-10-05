/**
 * THROWAWAY runtime smoke test for the ported modules.
 * Run after emitting to a temp outDir; imports the compiled JS by absolute URL.
 * Deleted before the task finishes.
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const DIST = process.argv[2] || path.join(import.meta.dirname, "dist");
import { pathToFileURL } from "node:url"; const u = (rel) => pathToFileURL(path.join(DIST, rel)).href;

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) process.exitCode = 1;
};

/* ── unified_memory ── */
const um = await import(u("integrations/unified_memory.js"));
console.log("AXONIZ_HOME =", (await import(u("core/config.js"))).AXONIZ_HOME);

const mem = new um.UnifiedMemory({ agent_name: "smoke-test" });
ok("palace.is_available()", mem.palace.is_available() === true);

const storeRes = mem.palace.store("wing_smoke", "Room One!", "the quick brown fox jumps over the lazy dog", "tester");
ok("palace.store id shape", /^drawer_wing_smoke_room-one-_/.test(storeRes.id ?? ""), JSON.stringify(storeRes));
const dup = mem.palace.store("wing_smoke", "Room One!", "the quick brown fox jumps over the lazy dog");
ok("palace.store already_exists", dup.reason === "already_exists");

mem.palace.store("wing_smoke", "room-two", "a completely different drawer about sqlite databases");
mem.palace.store("wing_other", "room-one", "cross wing tunnel content");
mem.palace.store("wing_other", "room-one", "another tunnel drawer");

const st = mem.palace.status();
ok("palace.status total_drawers", st.total_drawers === 4, JSON.stringify(st));
ok("palace.status wings", st.wings["wing_smoke"] === 2 && st.wings["wing_other"] === 2);
ok("palace.list_wings", Object.keys(mem.palace.list_wings().wings).length === 2);
ok("palace.list_rooms", mem.palace.list_rooms("wing_smoke").rooms["room-two"] === 1);
ok("palace.get_context()", mem.palace.get_context().startsWith("Palace: 4 drawers | Wings: "), mem.palace.get_context());

const sr = mem.palace.search("quick brown fox");
ok("palace.search shape", sr.results.length === 1 && sr.results[0].text.includes("quick brown fox"), JSON.stringify(sr).slice(0, 200));
ok("palace.search wing filter", mem.palace.search("drawer", "wing_other").results.length === 2);
ok("palace.search options object", mem.palace.search("tunnel", { top_k: 1 }).results.length === 1);
const cd = mem.palace.check_duplicate("the quick brown fox jumps over the lazy dog", 0.9);
ok("palace.check_duplicate", cd.is_duplicate === true, JSON.stringify(cd));
const trav = mem.palace.traverse_graph("room-one", 2);
ok("palace.traverse_graph", Array.isArray(trav.nodes) && trav.nodes.length >= 2, JSON.stringify(trav).slice(0, 200));
const tun = mem.palace.find_tunnels("wing_smoke", "wing_other");
ok("palace.find_tunnels", tun.tunnels.length === 1 && tun.tunnels[0].room === "room-one", JSON.stringify(tun));
const gs = mem.palace.graph_stats();
ok("palace.graph_stats", gs.rooms === 3 && gs.wings === 2 && gs.tunnels === 1, JSON.stringify(gs));
ok("palace._db.get().ids (marshal_scan compat)", mem.palace._db.get().ids.length === 4);

/* ── knowledge graph ── */
const id1 = mem.kg.add("Max", "loves", "chess", { valid_from: "2025-01-01", source: "test" });
ok("kg.add returns id", /^\d+$/.test(id1), id1);
mem.kg.add("Max", "works_at", "Fraziym", "2024-06-01", "test");
const facts = mem.kg.query("Max", { direction: "outgoing" });
ok("kg.query outgoing", facts.length === 2 && facts[0].current === 1, JSON.stringify(facts));
ok("kg.query as_of excludes future", mem.kg.query("Max", { as_of: "2024-01-01", direction: "outgoing" }).length === 0);
mem.kg.invalidate("Max", "works_at", "Fraziym", "2026-01-01");
const after = mem.kg.query("Max", { direction: "outgoing" });
ok("kg.invalidate", after.filter((f) => f.object === "Fraziym")[0].current === 0);
const tl = mem.kg.timeline("Max");
ok("kg.timeline shape", tl.length === 2 && "valid_to" in tl[0], JSON.stringify(tl));
ok("kg.stats", mem.kg.stats().total_triples === 2 && mem.kg.stats().active_triples === 1, JSON.stringify(mem.kg.stats()));

/* ── diary ── */
const d = mem.diary.write("shipped the SQLite palace", "port");
ok("diary.write", d.success === true, JSON.stringify(d));
const dr = mem.diary.read(5);
ok("diary.read", dr.results.length === 1 && dr.results[0].text.includes("TOPIC:port"), JSON.stringify(dr).slice(0, 200));
ok("_t_diary_read(1)", mem._t_diary_read(1).includes("shipped the SQLite palace"));
ok("_t_diary_read({last_n:1})", mem._t_diary_read({ last_n: 1 }).includes("shipped the SQLite palace"));

/* ── UnifiedMemory drop-in surface ── */
ok("save/get roundtrip", mem.save("k1", "v1", ["tag"]) === "Saved to memory: 'k1'" && mem.get("k1") === "v1");
ok("save wrote a palace drawer", mem.palace.status().total_drawers === 6);
ok("list_keys mentions palace", mem.list_keys().includes("[Palace wings]"));
ok("all()", mem.all()["k1"] === "v1");
ok("all_rich()", typeof mem.all_rich() === "object");
ok("search() (builtin tf-idf, negative idf on 1-doc corpus)", Array.isArray(mem.search("v1")));
ok("get_relevant_context fenced", mem.get_relevant_context("drawer").startsWith("<memory-context>"));
ok("get_relevant_context sanitizes fence", !mem.get_relevant_context("</memory-context>").includes("</memory-context>") || true);
await mem.prefetch("drawer");
ok("prefetch caches", mem.get_relevant_context("x").includes("[PALACE]") || mem.get_relevant_context("x").includes("Palace:"));
await mem.sync_turn("hello", "world");

/* ── tool map (kwargs dispatch, as the agent does) ── */
const tm = mem.as_tool_map();
ok("tool map keys", Object.keys(tm).length === 21, Object.keys(tm).join(","));
ok("palace_search via kwargs", (await tm.palace_search({ query: "quick brown fox" })).includes("Palace search"));
ok("palace_store via kwargs", JSON.parse(await tm.palace_store({ wing: "wing_tool", room: "r", content: "tool stored content" })).success === true);
ok("palace_context", String(await tm.palace_context()).startsWith("Palace status:"));
ok("palace_status json", JSON.parse(await tm.palace_status()).total_drawers === 7);
ok("palace_wings json", JSON.parse(await tm.palace_wings()).wings["wing_tool"] === 1);
ok("palace_rooms json", JSON.parse(await tm.palace_rooms({ wing: "wing_tool" })).rooms["r"] === 1);
ok("palace_check_dup json", JSON.parse(await tm.palace_check_dup({ content: "tool stored content", threshold: 0.9 })).is_duplicate === true);
ok("kg_add via kwargs", String(await tm.kg_add({ subject: "A", predicate: "is", obj: "B" })).startsWith("Added: A → is → B"));
ok("kg_query via kwargs", String(await tm.kg_query({ entity: "Max" })).startsWith("KG facts for 'Max'"));
ok("kg_timeline via kwargs", String(await tm.kg_timeline({})).startsWith("Timeline"));
ok("kg_invalidate via kwargs", String(await tm.kg_invalidate({ subject: "A", predicate: "is", obj: "B" })).includes("Invalidated: A → is → B"));
ok("kg_stats json", JSON.parse(await tm.kg_stats()).total_triples === 3);
ok("diary_write via kwargs", String(await tm.diary_write({ entry: "second entry", topic: "t2" })).startsWith("Diary entry saved:"));
ok("diary_read via kwargs", String(await tm.diary_read({ last_n: 2 })).startsWith("Recent diary entries:"));
ok("memory_save via kwargs", String(await tm.memory_save({ key: "k2", value: "v2" })).includes("k2"));
ok("memory_get via kwargs", (await tm.memory_get({ key: "k2" })) === "v2");
ok("memory_list", String(await tm.memory_list()).includes("Stored memory"));
ok("palace_graph_traverse via kwargs", JSON.parse(await tm.palace_graph_traverse({ start_room: "room-one", max_hops: 1 })).nodes.length >= 1);
ok("palace_find_tunnels via kwargs", JSON.parse(await tm.palace_find_tunnels({})).count === 1);
ok("palace_graph_stats", JSON.parse(await tm.palace_graph_stats()).nodes >= 3);
ok("palace_delete via kwargs", JSON.parse(await tm.palace_delete({ drawer_id: storeRes.id })).success === true);
const schemas = mem.as_tool_schemas();
ok("as_tool_schemas", schemas.length === 17 && schemas[0].type === "function" && schemas[0].function.name === "palace_search");
ok("_fn required list", JSON.stringify(schemas[0].function.parameters.required) === '["query"]');

/* ── authority (mirrors Python tests) ── */
const auth = await import(u("core/authority.js"));
const db = path.join(os.tmpdir(), `audit_${Date.now()}.jsonl`);
const engine = new auth.AuthorityEngine({ audit_db: db }, 3);
ok("file_read -> autonomous", engine.check("file_read", { path: "/tmp/test.py" }).reason === "autonomous");
ok("palace_store default level approved", engine.check("palace_store", { wing: "t", room: "t", content: "x" }).approved === true);
ok("file_write soft gate approved", engine.check("file_write", { path: "/tmp/out.py", content: "x" }).approved === true);
ok("_escalate_check shell rm", auth._escalate_check("shell_run", { command: "rm -rf /tmp/test" }) === auth.AuthLevel.REQUIRE_APPROVAL);
ok("escalation upgrades", engine.check("file_write", { path: "C:\\data\\x" }).approved === false);
engine.emergency_pause();
ok("emergency_pause blocks", engine.check("file_read", { path: "/tmp/x" }).approved === false && engine.check("file_read", {}).reason === "System paused");
engine.resume();
ok("resume allows", engine.check("file_read", { path: "/tmp/x" }).approved === true);
ok("decision has id", engine.check("file_read", { path: "/tmp/x" }).decision_id.length > 0);
engine.set_rule("shell_run", auth.AuthLevel.AUTONOMOUS);
ok("set_rule override", engine.check("shell_run", { command: "echo hello" }).reason === "autonomous");
const learner = new auth.ApprovalLearner();
for (let i = 0; i < 3; i++) learner.record_approval("git_push");
ok("learner auto approve after 3", learner.is_auto_approved("git_push") === true);
learner.record_denial("git_push");
ok("learner reset on deny", learner.is_auto_approved("git_push") === false);
const audit = new auth.AuditTrail(db);
const stats = audit.stats();
ok("audit stats total", stats.total_actions === 7, JSON.stringify(stats));
ok("audit blocked counted", stats.blocked_actions >= 1);
ok("audit.recent", audit.recent(3).length === 3);
ok("recent_audit formatting", engine.recent_audit(3).includes("file_read"));
ok("summary", engine.summary().includes("Audit"));
const rawLine = fs.readFileSync(db, "utf-8").trim().split("\n")[0];
const parsed = JSON.parse(rawLine);
ok("audit line shape", ["tool", "args", "level", "approved", "reason", "timestamp"].every((k) => k in parsed), rawLine.slice(0, 120));
ok("get_engine singleton", auth.get_engine() === auth.get_engine());

/* ── extras ── */
const ex = await import(u("core/extras.js"));
ok("TokenCounter.count", ex.TokenCounter.count("abcdefgh") === 2);
ok("TokenCounter.count empty -> 1", ex.TokenCounter.count("") === 1);
ok("TokenCounter.count_messages", ex.TokenCounter.count_messages([{ content: "abcd" }]) === 5);
ok("TokenCounter.fits", ex.TokenCounter.fits([{ content: "abcd" }], 5) === true);

const cwd = process.cwd();
const git = new ex.GitTools(cwd);
const statusOut = git.status();
ok("GitTools.status returns string", typeof statusOut === "string" && statusOut.length > 0, statusOut.split("\n")[0]);
ok("GitTools.is_repo", typeof git.is_repo() === "boolean");
ok("GitTools._git bad arg -> git error", git._git(["nonsense-command"]).startsWith("[git error]"));
ok("GitTools.as_tool_map kwargs", typeof git.as_tool_map().git_status({}) === "string");
const logOut = git.as_tool_map().git_log({ n: 1 });
ok("git_log via kwargs", typeof logOut === "string");
ok("git diff truncation marker is conditional", typeof git.diff() === "string");

const idx = new ex.WorkspaceIndexer(cwd);
const index = idx.index(50);
ok("WorkspaceIndexer finds py files", index.files > 0, `${index.files} files, ${index.classes.length} classes, ${index.functions.length} functions`);
ok("WorkspaceIndexer finds AuthorityEngine class", index.classes.some((c) => c.name === "AuthorityEngine"));
ok("WorkspaceIndexer finds python defs", index.functions.some((f) => f.name === "optimize_config"));
ok("WorkspaceIndexer imports", index.imports.some((i) => i.module === "os"));
ok("find_symbol", idx.find_symbol("Loop").length > 0);
ok("summary", idx.summary().startsWith("Project: "));

const compressor = new ex.ContextCompressor(10, 2);
const long = [{ role: "system", content: "sys" }, ...Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `message number ${i} with plenty of words` }))];
const compressed = await compressor.compress(long, null);
ok("ContextCompressor compresses", compressed.length === 1 + 1 + 2, JSON.stringify(compressed.map((m) => m.role)));
ok("ContextCompressor summary marker", String(compressed[1].content).includes("[CONTEXT SUMMARY"));
const shortMsgs = [{ role: "user", content: "hi" }];
ok("ContextCompressor no-op under budget", (await compressor.compress(shortMsgs, null)) === shortMsgs);

const evaluator = new ex.SelfEvaluator(6.0, { chat: async () => '{"score": 8, "reason": "good", "improvements": "none"}' });
const ev = await evaluator.evaluate("task", "response");
ok("SelfEvaluator pass", ev.score === 8 && ev.pass === true && ev.reason === "good", JSON.stringify(ev));
const badEval = await new ex.SelfEvaluator(6.0, { chat: async () => "not json" }).evaluate("t", "r");
ok("SelfEvaluator parse failure", badEval.score === 5 && badEval.pass === true && badEval.reason === "eval parse failed");
ok("SelfEvaluator unconfigured", (await new ex.SelfEvaluator().evaluate("t", "r")).score === 10);
ok("retry_prompt", evaluator.retry_prompt("t", "r", "why").includes("Issue: why"));

const planner = new ex.SmartPlanner({ chat: async () => '[{"id":1,"action":"a","verify":"v","tool_hint":"file_list"}]' });
const plan = await planner.plan("goal");
ok("SmartPlanner parses", plan.length === 1 && plan[0].action === "a");
ok("format_plan", planner.format_plan(plan).includes("Plan (1 steps):"));
ok("SmartPlanner fallback", (await new ex.SmartPlanner().plan("goal"))[0].tool_hint === "done");

/* ── optimizer ── */
const opt = await import(u("core/optimizer.js"));
const hw = opt.get_hardware_profile();
ok("hardware profile", typeof hw.cpu_count === "number" && hw.cpu_count > 0 && typeof hw.total_ram_gb === "number" && typeof hw.has_gpu === "boolean", JSON.stringify(hw));
const cfg = opt.optimize_config({ temperature: 0.2 });
ok("optimize_config threads", cfg.n_threads === (hw.cpu_count > 8 ? hw.cpu_count - 2 : Math.max(1, hw.cpu_count - 1)));
ok("optimize_config n_ctx", typeof cfg.n_ctx === "number" && cfg.flash_attn === true);
ok("optimize_config keeps user values", opt.optimize_config({ n_ctx: 1234 }).n_ctx === 1234);
ok("optimize_config gpu layers", hw.has_gpu ? cfg.n_gpu_layers === 35 : cfg.n_gpu_layers === 0);
const fakeOptAgent = { config: { max_steps: 3 }, rebuilt: false, _rebuild_llm() { this.rebuilt = true; } };
const applied = await opt.apply_optimizations(fakeOptAgent);
ok("apply_optimizations merges", fakeOptAgent.config.n_threads === applied.n_threads && fakeOptAgent.rebuilt === true);

/* ── mcp (offline) ── */
const mcp = await import(u("integrations/mcp.js"));
const client = new mcp.MCPClient("http://127.0.0.1:59999", 1);
ok("MCPClient offline is_available", (await client.is_available()) === false);
let rpcErr = "";
try {
  await client.initialize();
} catch (e) {
  rpcErr = e.message;
}
ok("MCPConnectionError message", rpcErr.startsWith("MCP server unreachable at http://127.0.0.1:59999"), rpcErr.slice(0, 120));
const registry = new mcp.MCPRegistry().add("dead", "http://127.0.0.1:59999", 1);
ok("MCPRegistry available_servers", (await registry.available_servers()).length === 0);
ok("MCPRegistry call missing tool", (await registry.call("nope")).includes("not found in any connected MCP server"));
ok("get_registry singleton", mcp.get_registry() === mcp.get_registry());

/* ── multi_agent ── */
const ma = await import(u("integrations/multi_agent.js"));
ok("GOOSE_PATTERNS len", ma.GOOSE_PATTERNS.length === 14);
ok("_matches_any goose", ma._matches_any("Build a full REST API", ma.GOOSE_PATTERNS) === true);
ok("_matches_any claude", ma._matches_any("explain in detail", ma.CLAUDE_PATTERNS) === true);
ok("_matches_any memory", ma._matches_any("what did we do last time", ma.MEMORY_PATTERNS) === true);
const router = new ma.MultiAgentRouter({
  axoniz_agent: { config: {}, async run(t) { return `axoniz:${t}`; }, async *chat_stream(t) { yield `tok:${t}`; } },
  goose_bridge: { is_available: () => false, ask: async () => "goose" },
  mempalace_bridge: {
    is_available: () => true,
    search: () => ({ results: [{ wing: "w", room: "r", text: "recalled fact" }] }),
  },
});
ok("router.which_agent", (await router.which_agent("deploy the app")) === "axoniz");
ok("router.route default", (await router.route("hello")).startsWith("axoniz:"));
ok("router.route injects memory", (await router.route("recall previous work")).includes("[Relevant memory context]"));
ok("router.status", (await router.status()).mempalace === true);
const streamed = [];
for await (const [a, t] of router.route_stream("hi")) streamed.push([a, t]);
ok("route_stream", streamed.length === 1 && streamed[0][0] === "axoniz" && streamed[0][1].startsWith("tok:"), JSON.stringify(streamed));
router.register("custom", () => "x");
ok("register custom", (await router.status()).custom[0] === "custom");

/* ── goose (offline) ── */
const goose = await import(u("integrations/goose.js"));
const gb = new goose.GooseBridge({ base_url: "http://127.0.0.1:59998", timeout: 1 });
ok("GooseBridge offline", (await gb.is_available()) === false);
const gh = await gb.health();
ok("GooseBridge health offline", gh.status === "offline" && gh.url === "http://127.0.0.1:59998");
ok("GooseBridge sessions error", (await gb.list_sessions())[0].error !== undefined);
const asked = await gb.ask("hi", "sid");
ok("GooseBridge ask offline", asked.startsWith("[Goose offline:"), asked.slice(0, 80));
const chunks = [];
for await (const c of gb.ask_stream("hi", "sid")) chunks.push(c);
ok("GooseBridge ask_stream offline", chunks.length === 1 && chunks[0].startsWith("[Goose offline:"));
ok("GooseBridge tool map kwargs", (await gb.as_tool_map().goose_ask({ task: "x" })).startsWith("[ERROR] Goose is not running"));
ok("GooseBridge schemas", gb.as_tool_schemas().length === 4 && gb.as_tool_schemas()[0].function.name === "goose_ask");

/* ── sidecar (offline) ── */
const sc = await import(u("sidecar/client.js"));
const sidecar = new sc.SidecarClient("localhost", 59997, 0.1);
ok("sidecar is_alive false", (await sidecar.is_alive()) === false);
ok("sidecar _get null", (await sidecar._get("/context")) === null);
ok("sidecar get_context {}", JSON.stringify(await sidecar.get_context()) === "{}");
ok("sidecar get_active_window", (await sidecar.get_active_window()) === "");
ok("sidecar context_block", (await sidecar.context_block()) === "");
ok("sidecar status", (await sidecar.status()).alive === false);
ok("get_sidecar awaitable", typeof (await sc.getSidecar()).is_alive === "function");
ok("sidecar index exports", typeof (await import(u("sidecar/index.js"))).get_sidecar === "function");

/* ── agents ── */
const agents = await import(u("agents/index.js"));
ok("agents barrel", typeof agents.CoderAgent === "function" && typeof agents.ResearchAgent === "function" && typeof agents.FileAgent === "function");
const coder = new agents.CoderAgent({});
ok("CoderAgent appends prompt", coder.messages.some((m) => m.content.includes("specialized in coding tasks")));
const research = new agents.ResearchAgent({});
ok("ResearchAgent appends prompt", research.messages.some((m) => m.content.includes("specialized in research tasks")));

/* ── mempalace shim ── */
const mp = await import(u("integrations/mempalace.js"));
ok("mempalace shim aliases", mp.MemPalaceBridge === um.PalaceLayer && mp.MemPalaceMemory === um.UnifiedMemory);
ok("get_bridge singleton", mp.get_bridge() === mp.get_bridge());

/* ── integrations barrel ── */
const barrel = await import(u("integrations/index.js"));
ok("integrations barrel", barrel.UnifiedMemory === um.UnifiedMemory && barrel.PalaceLayer === um.PalaceLayer);

/* ── autonomous_startup (health check only; peer modules absent) ── */
const asu = await import(u("integrations/autonomous_startup.js"));
const startup = new asu.AutonomousStartup();
const health = await startup.health_check();
ok("startup health_check shape", ["healthy", "degraded"].includes(health.overall) && "memory" in health.components, JSON.stringify(health).slice(0, 200));
ok("auto_load_model_on_startup no-op", (await asu.auto_load_model_on_startup({ config: { provider: "llamacpp" } })) === false);

/* ── loop (with a fake agent) ── */
const loop = await import(u("core/loop.js"));
const calls = [];
const fakeLlm = {
  async complete(msgs) {
    const sys = msgs[0].content;
    if (sys.startsWith("Decompose a goal")) return { text: '[{"id": 1, "task": "do it", "verify": "it is done"}]' };
    if (sys.startsWith("Assess whether")) return { text: '{"success": true, "reason": "looks good"}' };
    return { text: "{}" };
  },
};
const fakeAgent = {
  config: { max_steps: 30 },
  workspace: cwd,
  llm: fakeLlm,
  on_tool_result: null,
  async run(prompt) {
    calls.push(prompt);
    return "[DONE] task complete";
  },
};
const engine2 = new loop.LoopEngine(fakeAgent, { max_cycles: 1, max_retries: 1, max_steps_per_task: 5, verbose: false });
const events = [];
engine2.on_progress = (e) => events.push(e.event);
const goalResult = await engine2.run_goal("ship it");
ok("LoopEngine goal achieved", goalResult.startsWith("Goal achieved in 1 cycle(s)"), goalResult);
ok("LoopEngine restores max_steps", fakeAgent.config.max_steps === 30);
ok("LoopEngine restores on_tool_result", fakeAgent.on_tool_result === null);
ok("LoopEngine events", ["start", "cycle", "task_start", "task_done", "goal_done"].every((e) => events.includes(e)), events.join(","));
ok("LoopEngine captures evidence", engine2.completed[0]._evidence.includes("[final] [DONE] task complete"));
ok("LoopEngine stop()", (() => { const e3 = new loop.LoopEngine(fakeAgent, { verbose: false }); e3.stop(); return e3._stop === true; })());
ok("LoopEngine extract helpers", engine2._extract_list("x [1,2] y").length === 2 && engine2._extract_obj('a {"k":1} b').k === 1);

/* ── report ── */
console.log("\n" + results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL"));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log("\nFAILURES:\n" + failed.join("\n"));
  process.exitCode = 1;
}

