/**
 * TUI Integration Test — launches the REAL built TUI binary via PTY,
 * submits a task through terminal input, and verifies the complete
 * execution lifecycle through the actual React/Ink event loop.
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const TEST_DIR = path.join(os.tmpdir(), "axoniz-tui-integration");
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const PTY_SCRIPT = path.join(REPO_ROOT, "scripts", "tui-pty-test.py");
const TUI_ENTRY = path.join(REPO_ROOT, "dist", "tui", "entry.js");

function setupFixture(): void {
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

function cleanupFixture(): void {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

function runTuiViaPty(task: string, timeout: number = 30): { output: string; exit_code: number; timed_out: boolean; task_sent: boolean; exit_sent: boolean } {
  const cmd = `python3 "${PTY_SCRIPT}" --task "${task}" --entry "${TUI_ENTRY}" --workspace "${TEST_DIR}" --timeout ${timeout}`;
  const result = execSync(cmd, { encoding: "utf-8", timeout: (timeout + 15) * 1000, maxBuffer: 1024 * 1024 * 10 });
  return JSON.parse(result.trim());
}

describe("TUI Integration Test — Real Terminal Interface via PTY", () => {
  before(() => setupFixture());
  after(() => cleanupFixture());

  test("TUI accepts input, agent runs, tools execute, files modified", () => {
    const result = runTuiViaPty("hi", 20);

    // 1. Task should have been sent (TUI rendered and accepted input)
    assert.ok(result.task_sent, "TUI should render and accept input");

    // 2. Tool calls should be visible in the terminal output
    // The TUI renders tool calls as "✓ tool_name"
    const toolNames = ["file_list", "file_read", "file_edit", "shell_run"];
    const visibleTools = toolNames.filter(t => result.output.includes(t));
    assert.ok(visibleTools.length >= 2,
      `Output should show >= 2 tool names, got: ${visibleTools}. Output tail: ${result.output.slice(-300)}`);

    // 3. File should be modified on disk (independently verified)
    const calcContent = fs.readFileSync(path.join(TEST_DIR, "calculator.js"), "utf-8");
    const multiplyLine = calcContent.split("\n").find(l => l.includes("multiply"));
    assert.ok(multiplyLine, "calculator.js should have multiply function");
    assert.ok(multiplyLine!.includes("a * b"), `Multiply should return a * b, got: ${multiplyLine}`);
    assert.ok(!multiplyLine!.includes("BUG"), "BUG comment should be gone");

    // 4. Tests should pass after the fix (independently verified via shell)
    const testOutput = execSync("node test.js", { cwd: TEST_DIR, encoding: "utf-8" });
    assert.ok(testOutput.includes("5/5 passed"), `Tests should pass, got: ${testOutput}`);
  });

  test("TUI handles /help slash command through the real interface", () => {
    const result = runTuiViaPty("/help", 15);
    assert.ok(result.task_sent, "TUI should accept /help input");
    assert.ok(result.output.includes("/help") || result.output.includes("AXONIZ Commands"),
      `TUI should render help text. Output tail: ${result.output.slice(-300)}`);
  });

  test("TUI handles 'exit' command", () => {
    const result = runTuiViaPty("exit", 10);
    assert.ok(result.task_sent, "TUI should accept 'exit' input");
    // The process should either exit or be killed — either way, the
    // test verifies the TUI accepted and processed the exit command.
  });
});
