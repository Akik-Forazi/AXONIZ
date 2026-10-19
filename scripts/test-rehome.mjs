import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* Mirror of src/core/config.ts tier resolution (kept in sync manually). */
const FRAZIYM_HOME = (process.env.FRAZIYM_HOME || "").trim() || path.join(os.homedir(), ".fraziym");
const AXONIZ_HOME = path.join(FRAZIYM_HOME, "axoniz");
const LOCAL_BASE = (process.env.FRAZIYM_LOCAL || "").trim() || (process.platform === "win32"
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "FRAZIYM")
  : process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Caches", "FRAZIYM")
    : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "fraziym"));
const AXONIZ_LOCAL = path.join(LOCAL_BASE, "axoniz");
const PROGRAMS_BASE = (process.env.FRAZIYM_PROGRAMS || "").trim() || (process.platform === "win32"
  ? path.join(process.env.ProgramFiles || process.env.PROGRAMFILES || "C:\\Program Files", "fraziym")
  : process.platform === "darwin" ? "/usr/local/fraziym" : "/opt/fraziym");
const LLAMA_BIN_DIR = fs.existsSync(path.join(PROGRAMS_BASE, "axoniz", "llama"))
  ? path.join(PROGRAMS_BASE, "axoniz", "llama")
  : path.join(AXONIZ_LOCAL, "llama");

function rehomeStalePath(p) {
  if (!p || typeof p !== "string") return p;
  const isAbs = /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p);
  if (!isAbs) return p;
  const m = p.match(/[\\/]\.axoniz[\\/]/) ?? p.match(/[\\/]\.fraziym[\\/]axoniz[\\/]/);
  if (!m) return p;
  const matchStart = m.index ?? -1;
  if (matchStart < 0) return p;
  const matchEnd = matchStart + m[0].length;
  const tail = p.slice(matchEnd);
  if (!tail) return p;
  const parts = tail.split(/[\\/]/);
  const first = parts[0];
  const tierBase =
    first === "models" || first === "voice_models"
      ? AXONIZ_LOCAL
      : first === "llama"
        ? LLAMA_BIN_DIR
        : AXONIZ_HOME;
  const tailParts = first === "llama" ? parts.slice(1) : parts;
  const candidate = path.join(tierBase, ...tailParts);
  if (candidate === p) return p;
  return candidate;
}

const TESTS = [
  ["C:\\Users\\akikf\\.axoniz\\models\\x.gguf", path.join(AXONIZ_LOCAL, "models", "x.gguf")],
  ["/home/bob/.axoniz/models/y.bin", path.join(AXONIZ_LOCAL, "models", "y.bin")],
  ["C:\\Users\\akikf\\.axoniz\\voice_models\\kokoro.onnx", path.join(AXONIZ_LOCAL, "voice_models", "kokoro.onnx")],
  ["C:\\Users\\akikf\\.axoniz\\llama\\llama-server.exe", path.join(LLAMA_BIN_DIR, "llama-server.exe")],
  ["C:\\Users\\akikf\\.axoniz\\config.json", path.join(AXONIZ_HOME, "config.json")],
  ["/home/bob/.fraziym/axoniz/palace/index.json", path.join(AXONIZ_HOME, "palace", "index.json")],
  [path.join(AXONIZ_HOME, "config.json"), path.join(AXONIZ_HOME, "config.json")],
  ["/usr/local/bin/node", "/usr/local/bin/node"],
  ["./models/x.gguf", "./models/x.gguf"],
  ["", ""],
  ["C:\\Users\\akikf\\.axoniz\\models\\lmstudio-community\\Gemma-3-1B-it\\gemma-3-1b-it.Q5_K_S.gguf",
   path.join(AXONIZ_LOCAL, "models", "lmstudio-community", "Gemma-3-1B-it", "gemma-3-1b-it.Q5_K_S.gguf")],
];
let pass = 0, fail = 0;
for (const [input, expected] of TESTS) {
  const actual = rehomeStalePath(input);
  if (actual === expected) {
    console.log(`  OK ${input.slice(0, 60)}${input.length > 60 ? "..." : ""}`);
    pass++;
  } else {
    console.log(`  FAIL input:    ${input}`);
    console.log(`       expected: ${expected}`);
    console.log(`       actual:   ${actual}`);
    fail++;
  }
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
