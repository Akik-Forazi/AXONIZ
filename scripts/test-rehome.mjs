import os from "node:os";
import path from "node:path";
const AXONIZ_HOME = path.join(os.homedir(), ".axoniz");
function rehomeStalePath(p) {
  if (!p || typeof p !== "string") return p;
  const isAbs = /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p);
  if (!isAbs) return p;
  const m = p.match(/[\\/]\.axoniz[\\/]/);
  if (!m) return p;
  const matchStart = m.index ?? -1;
  if (matchStart < 0) return p;
  const matchEnd = matchStart + m[0].length;
  const tail = p.slice(matchEnd);
  if (!tail) return p;
  const candidate = path.join(AXONIZ_HOME, ...tail.split(/[\\/]/));
  if (candidate === p) return p;
  return candidate;
}
const TESTS = [
  ["C:\\Users\\akikf\\.axoniz\\models\\x.gguf", path.join(AXONIZ_HOME, "models", "x.gguf")],
  ["/home/bob/.axoniz/models/y.bin", path.join(AXONIZ_HOME, "models", "y.bin")],
  ["/usr/local/bin/node", "/usr/local/bin/node"],
  ["./models/x.gguf", "./models/x.gguf"],
  ["", ""],
  ["C:\\Users\\akikf\\.axoniz\\models\\lmstudio-community\\Gemma-3-1B-it\\gemma-3-1b-it.Q5_K_S.gguf",
   path.join(AXONIZ_HOME, "models", "lmstudio-community", "Gemma-3-1B-it", "gemma-3-1b-it.Q5_K_S.gguf")],
];
let pass = 0, fail = 0;
for (const [input, expected] of TESTS) {
  const actual = rehomeStalePath(input);
  if (actual === expected) {
    console.log(`  ✓ ${input.slice(0, 60)}${input.length > 60 ? "…" : ""}`);
    pass++;
  } else {
    console.log(`  ✗ input:    ${input}`);
    console.log(`    expected: ${expected}`);
    console.log(`    actual:   ${actual}`);
    fail++;
  }
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
