#!/usr/bin/env node
// Add `import { authedFetch } from "@/lib/axoniz/client";` to files that
// use bare fetch("/api/axoniz/..."), and rewrite those fetch() calls to
// authedFetch(). Also strips the now-unneeded `headers: { "Content-Type":
// "application/json" }` lines (authedFetch sets Content-Type + Authorization).
import fs from "node:fs";
import path from "node:path";

const files = [
  "src/components/axoniz/model-picker.tsx",
  "src/components/axoniz/zai-chat/use-chat-stream.ts",
  "src/components/axoniz/zai-chat/use-conversations.ts",
  "src/components/axoniz/zai-chat/use-live-models.ts",
  "src/components/axoniz/sidebar.tsx",
  "src/components/axoniz/pages/agent.tsx",
  "src/app/(auth)/diagnostics/page.tsx",
  "src/app/(auth)/servers/page.tsx",
  "src/app/(auth)/chat/page.tsx",
  "src/app/(auth)/agent/page.tsx",
];

const root = "/home/z/my-project/AXONIZ/web";

for (const rel of files) {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) {
    console.log(`SKIP (missing): ${rel}`);
    continue;
  }
  let src = fs.readFileSync(f, "utf-8");
  const orig = src;

  // 1. Add the import after the last existing `from "@/` import.
  if (!src.includes('authedFetch')) {
    // Find the last `import ... from "@/...";` line and inject ours after it.
    const importRe = /^import .* from "@\/[^"]+";\s*$/gm;
    let lastMatch = null;
    let m;
    while ((m = importRe.exec(src)) !== null) lastMatch = m;
    if (lastMatch) {
      const insertAt = lastMatch.index + lastMatch[0].length;
      const inserted = `\nimport { authedFetch } from "@/lib/axoniz/client";`;
      src = src.slice(0, insertAt) + inserted + src.slice(insertAt);
    } else {
      // No "@/..." imports — prepend after the first `import` line.
      const firstImport = src.match(/^import .*$/m);
      if (firstImport) {
        src = src.replace(firstImport[0], firstImport[0] + '\nimport { authedFetch } from "@/lib/axoniz/client";');
      }
    }
  }

  // 2. Replace fetch( with authedFetch( only when the next arg is a string
  // starting with /api/axoniz. Be conservative — only replace `fetch("/api/axoniz`
  // and `fetch(`/api/axoniz`.
  src = src.replace(/\bfetch\(("|`|')\/api\/axoniz/g, 'authedFetch($1/api/axoniz');

  // 3. Strip the `headers: { "Content-Type": "application/json" },` lines
  // inside the authedFetch calls — authedFetch sets them automatically.
  // Match `  headers: { "Content-Type": "application/json" },\n`
  src = src.replace(/^\s*headers:\s*\{\s*"Content-Type":\s*"application\/json"\s*\},?\s*\n/gm, "");

  if (src !== orig) {
    fs.writeFileSync(f, src, "utf-8");
    console.log(`UPDATED: ${rel}`);
  } else {
    console.log(`NO-CHANGE: ${rel}`);
  }
}
