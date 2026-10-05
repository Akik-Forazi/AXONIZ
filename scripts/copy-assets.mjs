/**
 * Copy non-TypeScript assets into dist/ after a build.
 * - src/roles/*.yaml -> dist/roles/       (persona role definitions)
 *
 * Runs as the `postbuild` npm script.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories whose entire contents should be mirrored into dist/. */
const DIRS = [["src/roles", "dist/roles"]];

function copyTree(from, to) {
  if (!fs.existsSync(from)) {
    console.log(`[copy-assets] skip (missing): ${from}`);
    return 0;
  }
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      n += copyTree(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
      n += 1;
    }
  }
  return n;
}

let total = 0;
for (const [from, to] of DIRS) {
  const src = path.join(root, from);
  const dst = path.join(root, to);
  const n = copyTree(src, dst);
  console.log(`[copy-assets] ${from} -> ${to} (${n} files)`);
  total += n;
}
console.log(`[copy-assets] done — ${total} files`);
