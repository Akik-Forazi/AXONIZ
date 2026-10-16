/**
 * Tests for the axolog diagnostic logger.
 * Run: node --test --experimental-strip-types test/diagnostics.test.ts
 *
 * Uses a per-test tmpHome. The DiagLogger reads the log dir via
 * getDiagLogDir(), which reads process.env.HOME at construction time —
 * so setting HOME *before* calling getDiagLogger() redirects writes.
 */
import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  _setDiagLoggerForTest,
  getDiagLogger,
  redact,
  sanitizeUsername,
  buildAxologFilename,
} from "../dist/core/diagnostics.js";

let tmpHome: string;
const ORIG_HOME = process.env.HOME;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "axoniz-test-"));
  process.env.HOME = tmpHome;
  _setDiagLoggerForTest(null);
});

afterEach(() => {
  _setDiagLoggerForTest(null);
  process.env.HOME = ORIG_HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
});

test("filename uses weekday + sanitized username", () => {
  const ref = new Date(2026, 9, 14, 21, 15, 30); // Oct 14, 2026 — Wednesday
  const name = buildAxologFilename(ref, "akik");
  assert.equal(name, "2026-10-14_21-15-30_Wednesday-akik.axolog");
});

test("username sanitization strips unsafe chars", () => {
  assert.equal(sanitizeUsername("akik"), "akik");
  assert.ok(!sanitizeUsername("../../etc/passwd").includes("/"));
  assert.equal(sanitizeUsername("user@host"), "user-host");
  assert.equal(sanitizeUsername(null), "unknown");
  assert.equal(sanitizeUsername(""), "unknown");
});

test("redact strips known-sensitive keys", () => {
  const out = redact({
    username: "akik",
    password: "hunter2",
    api_key: "sk-xxxx",
    nested: { token: "abc", safe: "ok" },
    arr: [{ secret: "x" }, { ok: 1 }],
  });
  assert.deepEqual(out, {
    username: "akik",
    password: "[REDACTED]",
    api_key: "[REDACTED]",
    nested: { token: "[REDACTED]", safe: "ok" },
    arr: [{ secret: "[REDACTED]" }, { ok: 1 }],
  });
});

test("redact masks bearer tokens inside strings", () => {
  const out = redact({ header: "Bearer abc123def456" }) as Record<string, unknown>;
  assert.ok(String(out.header).includes("[REDACTED]"));
  assert.ok(!String(out.header).includes("abc123def456"));
});

test("emits session_start event + creates .axolog file", () => {
  const log = getDiagLogger("alice");
  try {
    assert.ok(log.filePath.endsWith(".axolog"));
    assert.ok(log.filePath.includes("alice"));
    assert.ok(fs.existsSync(log.filePath));
    const lines = fs.readFileSync(log.filePath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 1);
    const evt = JSON.parse(lines[0]);
    assert.equal(evt.event_type, "session_start");
    assert.equal(typeof evt.application_version, "string");
    assert.equal(evt.schema_version, 1);
    assert.match(evt.timezone_offset, /^[+-]\d{2}:\d{2}$/);
  } finally {
    log.close();
  }
});

test("emit returns true on success and writes the line", () => {
  const log = getDiagLogger("bob");
  try {
    const ok = log.emit({ component: "test", event_type: "click", details: { button: "save" } });
    assert.equal(ok, true);
    const lines = fs.readFileSync(log.filePath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 2);
    const evt = JSON.parse(lines[1]);
    assert.equal(evt.event_type, "click");
    assert.equal(evt.details.button, "save");
    assert.equal(evt.redaction_applied, true);
  } finally {
    log.close();
  }
});

test("sequence numbers are monotonic", () => {
  const log = getDiagLogger("diana");
  try {
    for (let i = 0; i < 5; i++) {
      log.emit({ component: "test", event_type: "tick", details: { i } });
    }
    const lines = fs.readFileSync(log.filePath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 6);
    const seqs = lines.map(l => JSON.parse(l).sequence);
    assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6]);
  } finally {
    log.close();
  }
});

test("truncated trailing record can be detected by parser", () => {
  const log = getDiagLogger("eve");
  try {
    log.emit({ component: "test", event_type: "good", details: {} });
    fs.appendFileSync(log.filePath, '{"event_type":"broken","details":{');
    const raw = fs.readFileSync(log.filePath, "utf-8").split("\n");
    let okCount = 0, broken = 0;
    for (const line of raw) {
      if (!line.trim()) continue;
      try { JSON.parse(line); okCount++; } catch { broken++; }
    }
    assert.ok(okCount >= 2);
    assert.equal(broken, 1);
  } finally {
    log.close();
  }
});

test("logger does not throw when target becomes read-only", () => {
  const log = getDiagLogger("charlie");
  try {
    try { fs.chmodSync(log.filePath, 0o400); } catch { /* some platforms don't support chmod */ }
    let threw = false;
    try {
      log.emit({ component: "test", event_type: "after_lock", details: { x: 1 } });
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
  } finally {
    try { fs.chmodSync(log.filePath, 0o600); } catch { /* ignore */ }
    log.close();
  }
});

test("redact strips chat-message-shaped fields when caller forgets", () => {
  // The caller is supposed to sanitize, but the redact() defense-in-depth
  // should still strip known-sensitive keys.
  const out = redact({
    user_input: "what is the password",   // not a sensitive key — kept
    system_prompt: "you are an assistant", // kept (caller's job to redact)
    response_preview: "...",                // kept
    api_key: "sk-leaked",                   // stripped
  }) as Record<string, unknown>;
  assert.equal(out.api_key, "[REDACTED]");
  assert.ok(typeof out.user_input === "string");
});
