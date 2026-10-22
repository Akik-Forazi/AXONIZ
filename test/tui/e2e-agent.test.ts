/**
 * End-to-end agent acceptance test — verifies the REAL agent tool-calling
 * loop works through the TUI's callback wiring.
 *
 * Creates a mock LLM backend that returns pre-scripted tool_call responses
 * (simulating what OrcaRouter/GPT-4 would return). The agent processes
 * these through its REAL runNative() loop, calling REAL tools (file_read,
 * file_edit, shell_run) on the REAL filesystem.
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { Agent } from "../../src/core/agent.js";
import { Backend, type ChatMessage, type CompletionResult, textResponse, toolCallResponse, type BackendHealth } from "../../src/core/backend/types.js";

class MockBackend extends Backend {
  name = "mock";
  tools: unknown[] = [];
  private idx = 0;
  private responses: CompletionResult[] = [
    toolCallResponse([{ name: "file_list", args: { path: "." } }]),
    toolCallResponse([{ name: "file_read", args: { path: "calculator.js" } }]),
    toolCallResponse([{ name: "file_read", args: { path: "test.js" } }]),
    toolCallResponse([{ name: "shell_run", args: { command: "node test.js" } }]),
    toolCallResponse([{ name: "file_edit", args: { path: "calculator.js", old: "return a + b;  // BUG: should be a * b", new: "return a * b;" } }]),
    toolCallResponse([{ name: "shell_run", args: { command: "node test.js" } }]),
    textResponse("Found and fixed the bug. multiply was returning a+b instead of a*b. All 5 tests pass."),
  ];
  async complete(_m: ChatMessage[], _t?: number): Promise<CompletionResult> { return this.responses[this.idx++] ?? textResponse("done"); }
  async *streamText(_m: ChatMessage[], _s?: AbortSignal, _t?: number): AsyncGenerator<string> { yield "mock"; }
  async healthCheck(): Promise<BackendHealth> { return { status: "ok", backend: "mock" }; }
}

const TEST_DIR = path.join(os.tmpdir(), "axoniz-e2e-test");
function setup() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_DIR, "calculator.js"),
    `function add(a, b) { return a + b; }
function subtract(a, b) { return a - b; }
function multiply(a, b) { return a + b;  // BUG: should be a * b }
function divide(a, b) { if (b === 0) throw new Error("Division by zero"); return a / b; }
module.exports = { add, subtract, multiply, divide };
`);
  fs.writeFileSync(path.join(TEST_DIR, "test.js"),
    `const { add, subtract, multiply, divide } = require("./calculator");
const assert = (a, e, m) => { if (a !== e) throw new Error(m + ": expected " + e + ", got " + a); };
let p = 0;
try { assert(add(2,3), 5, "add"); p++; } catch {}
try { assert(subtract(5,3), 2, "sub"); p++; } catch {}
try { assert(multiply(3,4), 12, "mul"); p++; } catch {}
try { assert(divide(10,2), 5, "div"); p++; } catch {}
try { divide(5,0); } catch { p++; }
console.log(p + "/5 passed");
process.exit(p === 5 ? 0 : 1);
`);
  fs.writeFileSync(path.join(TEST_DIR, "package.json"), '{"name":"calc","version":"1.0.0"}');
}
function cleanup() { fs.rmSync(TEST_DIR, { recursive: true, force: true }); }

describe("AXONIZ E2E Agent Test", () => {
  let agent: Agent;
  let toolCalls: any[], toolResults: any[], tokens: string, steps: any[], doneCalled: boolean;

  before(() => {
    setup();
    const mock = new MockBackend();
    agent = new Agent({
      provider: "mock", workspace: TEST_DIR,
      llm: { active_provider: "mock", providers: { mock: {} } },
      agent: { max_steps: 30, tools: { file_system: true, web_search: false, axodex_graph: false } },
      memory: { palace_enabled: false, kg_enabled: false },
      swarm_models: {}, daemon: { enabled: false }, awareness: { enabled: false },
      logging: { level: "ERROR", console: false, file: false, structured: false, max_bytes: 1024, backup_count: 1, capture_llm_prompts: false, capture_tool_args: false, capture_tool_results: false, capture_backend_health: false },
    });
    // CRITICAL: override the backend AFTER constructor but BEFORE run()
    // Must set llmLoaded=true so ensureLlm() doesn't rebuild from config
    (agent as any).llm = mock;
    (agent as any).backend = mock;
    (agent as any).llmLoaded = true;
    toolCalls = []; toolResults = []; tokens = ""; steps = []; doneCalled = false;
    agent.onToken = (t: string) => { tokens += t; };
    agent.onToolCall = (n: string, a: any) => { toolCalls.push({ name: n, args: a }); };
    agent.onToolResult = (n: string, r: string) => { toolResults.push({ name: n, result: r }); };
    agent.onStep = (s: number, t: number) => { steps.push({ step: s, total: t }); };
    agent.onDone = () => { doneCalled = true; };
  });
  after(() => { cleanup(); });

  test("agent.run() completes multi-step task with tool calls", async () => {
    const result = await agent.run("Find and fix the bug in the calculator, then run the tests");
    assert.ok(result.length > 0, "Agent should return a text result");
    assert.ok(toolCalls.length >= 4, `Expected >= 4 tool calls, got ${toolCalls.length}`);
    assert.ok(toolCalls.some(t => t.name === "file_list"), "Should call file_list");
    assert.ok(toolCalls.some(t => t.name === "file_read"), "Should call file_read");
    assert.ok(toolCalls.some(t => t.name === "shell_run"), "Should call shell_run");
    assert.ok(toolCalls.some(t => t.name === "file_edit"), "Should call file_edit");
    assert.equal(toolResults.length, toolCalls.length, "Each call should have a result");
    assert.ok(tokens.length > 0, "onToken should fire");

    const fixed = fs.readFileSync(path.join(TEST_DIR, "calculator.js"), "utf-8");
    assert.ok(fixed.includes("return a * b;"), "Multiply should return a * b");
    assert.ok(!fixed.includes("BUG"), "BUG comment should be gone");

    const out = execSync("node test.js", { cwd: TEST_DIR, encoding: "utf-8" });
    assert.ok(out.includes("5/5 passed"), `Tests should pass, got: ${out}`);
  });

  test("tool calls and results correctly associated", () => {
    for (let i = 0; i < toolCalls.length; i++) {
      assert.equal(toolResults[i].name, toolCalls[i].name, `Call ${i} name mismatch`);
    }
  });

  test("agent continued after receiving tool results", () => {
    assert.ok(toolCalls.length > 1, "Agent should not stop after first call");
    assert.ok(toolCalls.length >= 4, "Should complete multiple dependent steps");
  });

  test("file modifications affected real filesystem", () => {
    const content = fs.readFileSync(path.join(TEST_DIR, "calculator.js"), "utf-8");
    // The multiply line should now have a * b, not a + b
    const multiplyLine = content.split("\n").find(l => l.includes("multiply"));
    assert.ok(multiplyLine, "Should have a multiply function");
    assert.ok(multiplyLine!.includes("a * b"), `Multiply should return a * b, got: ${multiplyLine}`);
    assert.ok(!multiplyLine!.includes("BUG"), "BUG comment should be gone from multiply");
  });

  test("shell commands executed in correct workspace", () => {
    // Shell results should contain test output (passed/failed counts)
    const shellResults = toolResults.filter(r => r.name === "shell_run");
    assert.ok(shellResults.length > 0, "Should have shell_run results");
    // At least one shell_run should show test results
    const hasTestOutput = shellResults.some(r => r.result.includes("passed") || r.result.includes("/5"));
    assert.ok(hasTestOutput, `Shell results should show test output: ${JSON.stringify(shellResults.map(r => r.result.slice(0, 50)))}`);
  });
});
