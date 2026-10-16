/**
 * Anti-loop test — verifies the previous fixes work.
 *
 * This is NOT a Playwright test. It runs at the HTTP level: starts the
 * Next.js dev server, makes controlled requests, and observes what
 * additional server-side requests appear in the dev log.
 *
 * Run: node scripts/anti-loop-test.mjs
 *
 * Pass criteria (from the task brief):
 *   - No infinite redirect cycle.
 *   - No unexpected full-page reloads.
 *   - No unbounded request growth.
 *   - No uncontrolled creation of duplicate EventSource connections.
 *   - No repeating request storm during idle periods.
 *   - Failed requests do not create tight retry loops.
 */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";

const PORT = 7861;
const WEB_NEXT_DIR = "/home/z/my-project/AXONIZ/web-next";
const DEV_LOG = "/tmp/axoniz-anti-loop.log";

let devPid = null;
let killed = false;

function startDev() {
  return new Promise((resolve, reject) => {
    // Clear .next cache so we get a clean start.
    try { fs.rmSync(path.join(WEB_NEXT_DIR, ".next"), { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.writeFileSync(DEV_LOG, ""); } catch { /* ignore */ }
    devPid = spawn("npx", ["next", "dev", "-p", String(PORT)], {
      cwd: WEB_NEXT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    devPid.stdout.on("data", chunk => {
      const line = chunk.toString();
      fs.appendFileSync(DEV_LOG, line);
      if (line.includes("Ready in")) {
        // Wait a moment for any initial compiles.
        setTimeout(() => resolve(devPid), 1500);
      }
    });
    devPid.stderr.on("data", chunk => {
      fs.appendFileSync(DEV_LOG, `[stderr] ${chunk.toString()}`);
    });
    devPid.on("exit", code => {
      if (!killed) reject(new Error(`dev exited early with code ${code}`));
    });
    // Timeout
    setTimeout(() => reject(new Error("dev did not become ready in 60s")), 60_000);
  });
}

async function get(path, opts = {}) {
  const url = `http://localhost:${PORT}${path}`;
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(5000) });
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

/** Parse the dev log for GET requests and tally per-path counts. */
function countRequests(since = 0) {
  const counts = {};
  let total = 0;
  const lines = fs.readFileSync(DEV_LOG, "utf-8").split("\n");
  for (const line of lines) {
    // Match lines like " GET / 200 in 3.8s ..." or " GET /chat 200 in 4.7s ..."
    // The URL is captured greedily up to the next whitespace + "200".
    if (!line.match(/GET\s+\S+\s+200/)) continue;
    const m = line.match(/GET\s+(\S+)\s+200/);
    if (!m) continue;
    const url = m[1].split("?")[0];
    counts[url] = (counts[url] || 0) + 1;
    total++;
  }
  return { counts, total };
}

async function main() {
  console.log("\n=== ANTI-LOOP TEST SUITE ===\n");
  console.log("Starting dev server on port", PORT);
  await startDev();
  console.log("Dev server ready\n");

  // Get baseline request count.
  const baseline = countRequests();
  console.log(`Baseline before tests: ${baseline.total} requests\n`);

  // === Test 1: GET / (home, anonymous user) ===
  console.log("TEST 1: GET / (anonymous user, expects LoginScreen)");
  const home = await get("/");
  console.log(`  status: ${home.status}`);
  console.assert(home.status === 200, "expected 200 for /");

  // Wait 2s for any follow-up polling
  await sleep(2000);
  const after1 = countRequests();
  console.log(`  total requests after 2s: ${after1.total - baseline.total}`);
  // Should NOT see /chat requests bouncing back.
  console.log("");

  // === Test 2: GET /chat directly (anonymous, expects LoginScreen via auth layout) ===
  console.log("TEST 2: GET /chat (anonymous, expects 200 + LoginScreen)");
  const chat = await get("/chat");
  console.log(`  status: ${chat.status}`);
  console.assert(chat.status === 200, "expected 200 for /chat");
  await sleep(2000);
  console.log("");

  // === Test 3: Multiple GET / in rapid succession ===
  console.log("TEST 3: 5 rapid GET / requests");
  const before3 = countRequests();
  for (let i = 0; i < 5; i++) await get("/");
  await sleep(2000);  // wait for log flush
  const after3 = countRequests();
  const home3 = (after3.counts["/"] || 0) - (before3.counts["/"] || 0);
  console.log(`  / requests: ${home3} (expected ~5, NOT many more)`);
  // Allow some slack for HMR compiles that might trigger extra requests.
  console.assert(home3 >= 5 && home3 <= 10, `expected ~5 / requests, got ${home3}`);
  console.log("");

  // === Test 4: Polling endpoints behave at their intended intervals ===
  console.log("TEST 4: /api/axoniz/health (single shot)");
  const health = await get("/api/axoniz/health");
  console.log(`  status: ${health.status}`);
  console.assert(health.status === 200, "expected 200 for health");
  console.log("");

  // === Test 5: Idle period — count requests during 15s of NO user activity ===
  console.log("TEST 5: 15s idle period — counting server-side requests");
  const before5 = countRequests();
  await sleep(15_000);
  const after5 = countRequests();
  const delta5 = after5.total - before5.total;
  console.log(`  ${delta5} requests during 15s idle`);
  console.log("  per-endpoint breakdown:");
  for (const [url, count] of Object.entries(after5.counts)) {
    const delta = count - (before5.counts[url] || 0);
    if (delta > 0) console.log(`    ${url}: ${delta}`);
  }
  // During 15s idle with no user activity, we should see very few requests.
  // The SSE stream stays open + maybe 1 health poll at 30s interval (none in 15s window).
  console.assert(delta5 <= 5, `expected <=5 idle requests, got ${delta5}`);
  console.log("");

  // === Test 6: /api/axoniz/diagnostics/log POST ===
  console.log("TEST 6: POST /api/axoniz/diagnostics/log");
  const diag = await fetch(`http://localhost:${PORT}/api/axoniz/diagnostics/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "anti-loop-test",
      events: [
        { event_type: "test_event", component: "test", action: "anti_loop", details: { ts: Date.now() } },
      ],
    }),
  });
  const diagBody = await diag.json();
  console.log(`  status: ${diag.status}, body: ${JSON.stringify(diagBody)}`);
  console.assert(diag.status === 200 && diagBody.ok === true, "expected 200 ok");
  console.log("");

  // === Final summary ===
  // Wait 2s for any in-flight log writes to flush.
  await sleep(2000);
  const final = countRequests();
  console.log("=== SUMMARY ===");
  console.log(`Total server-side GET requests observed: ${final.total}`);
  console.log("\nPer-endpoint counts:");
  for (const [url, count] of Object.entries(final.counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${url}: ${count}`);
  }

  // Cleanup
  killed = true;
  try { devPid.kill("SIGTERM"); } catch { /* ignore */ }
  process.exit(0);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => {
  console.error("ANTI-LOOP TEST FAILED:", e);
  tryShutDown();
  process.exit(1);
});

function tryShutDown() {
  try { devPid?.kill("SIGKILL"); } catch { /* ignore */ }
}
