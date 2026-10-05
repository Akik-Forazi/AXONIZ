import fs from "node:fs";
const url = "https://registry.npmjs.org/node-llama-cpp/-/node-llama-cpp-3.22.1.tgz";
const dest = "_dl/node-llama-cpp-3.22.1.tgz";
fs.mkdirSync("_dl", { recursive: true });
let attempt = 0;
while (attempt < 8) {
  attempt++;
  let start = 0;
  try { start = fs.statSync(dest).size; } catch {}
  try {
    const r = await fetch(url, { headers: start > 0 ? { range: `bytes=${start}-` } : {}, signal: AbortSignal.timeout(120000) });
    if (r.status === 416) { console.log("already complete"); break; }
    if (r.status !== 206 && start > 0) { console.log("server ignored range, restarting"); start = 0; fs.rmSync(dest, { force: true }); continue; }
    const total = start + Number(r.headers.get("content-length") || 0);
    const fd = fs.openSync(dest, start > 0 ? "a" : "w");
    let got = start;
    for await (const chunk of r.body) { fs.writeSync(fd, chunk); got += chunk.length; }
    fs.closeSync(fd);
    console.log(`attempt ${attempt}: ${(got/1048576).toFixed(2)}MB / ${(total/1048576).toFixed(2)}MB`);
    if (total > 0 && got >= total) { console.log("DONE"); break; }
  } catch (e) {
    console.log(`attempt ${attempt} failed: ${e.message} (have ${(start/1048576).toFixed(2)}MB)`);
  }
}
