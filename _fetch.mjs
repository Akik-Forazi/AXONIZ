/**
 * Resumable tarball fetcher for degraded registry connections.
 * Usage: node _fetch.mjs <url> <destPath> [maxAttempts] [timeoutMs]
 */
import fs from "node:fs";
import path from "node:path";

const [, , url, dest, maxAttemptsArg, timeoutArg] = process.argv;
if (!url || !dest) {
  console.error("usage: node _fetch.mjs <url> <dest> [maxAttempts] [timeoutMs]");
  process.exit(2);
}
const maxAttempts = Number(maxAttemptsArg ?? 10);
const timeoutMs = Number(timeoutArg ?? 180000);

fs.mkdirSync(path.dirname(dest), { recursive: true });

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  let start = 0;
  try {
    start = fs.statSync(dest).size;
  } catch {
    /* absent */
  }

  try {
    const headers = start > 0 ? { range: `bytes=${start}-` } : {};
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });

    if (r.status === 416) {
      console.log(`already complete (${(start / 1048576).toFixed(2)}MB)`);
      process.exit(0);
    }
    if (start > 0 && r.status !== 206) {
      console.log("server ignored Range -> restarting");
      fs.rmSync(dest, { force: true });
      start = 0;
      continue;
    }
    if (!r.ok && r.status !== 206) {
      console.log(`attempt ${attempt}: HTTP ${r.status}`);
      continue;
    }

    const total = start + Number(r.headers.get("content-length") || 0);
    const fd = fs.openSync(dest, start > 0 ? "a" : "w");
    let got = start;
    for await (const chunk of r.body) {
      fs.writeSync(fd, chunk);
      got += chunk.length;
    }
    fs.closeSync(fd);

    console.log(
      `attempt ${attempt}: ${(got / 1048576).toFixed(2)}MB / ${total > 0 ? (total / 1048576).toFixed(2) + "MB" : "?"}`,
    );
    if (total > 0 && got >= total) {
      console.log("DONE " + dest);
      process.exit(0);
    }
  } catch (e) {
    console.log(
      `attempt ${attempt} failed: ${e.message} (have ${(start / 1048576).toFixed(2)}MB)`,
    );
  }
}
console.log("GAVE UP (partial file retained for resume)");
process.exit(1);
