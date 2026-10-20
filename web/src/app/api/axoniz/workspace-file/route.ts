import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ROOT = "/home/z/my-project/AXONIZ";
const DEFAULT_WORKSPACE = "/home/z/my-project/AXONIZ";
const MAX_BYTES = 1_500_000;

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript",
  cjs: "javascript", json: "json", md: "markdown", markdown: "markdown",
  txt: "text", css: "css", scss: "scss", html: "html", py: "python",
  rs: "rust", go: "go", java: "java", kt: "kotlin", rb: "ruby", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", yml: "yaml", yaml: "yaml",
  toml: "toml", ini: "ini", sql: "sql", prisma: "prisma", graphql: "graphql",
  vue: "vue", svelte: "svelte", xml: "xml", svg: "svg", env: "ini",
};

const BINARY_HINTS = new Set([
  "png","jpg","jpeg","gif","webp","ico","bmp","tiff","pdf","zip","tar",
  "gz","rar","7z","exe","dll","so","dylib","bin","dat","db","sqlite",
  "sqlite3","class","jar","wasm","mp4","mov","mp3","wav","ogg","webm",
]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const requested = sp.get("path");
  if (!requested) return NextResponse.json({ error: "Missing path." }, { status: 400 });

  const resolved = path.isAbsolute(requested)
    ? path.normalize(requested)
    : path.resolve(DEFAULT_WORKSPACE, requested);

  if (!resolved.startsWith(SAFE_ROOT)) {
    return NextResponse.json({ error: "Path outside workspace." }, { status: 403 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return NextResponse.json({ error: "Not a file." }, { status: 400 });
    if (stat.size > MAX_BYTES) {
      return NextResponse.json({
        path: resolved, name: path.basename(resolved), size: stat.size,
        truncated: true, readOnly: true, language: "text",
        content: `[File too large — ${stat.size} bytes. Use shell to read slices.]`,
      });
    }
    const ext = path.extname(resolved).slice(1).toLowerCase();
    if (BINARY_HINTS.has(ext)) {
      return NextResponse.json({
        path: resolved, name: path.basename(resolved), size: stat.size,
        readOnly: true, binary: true, language: ext,
        content: `[Binary file — ${ext.toUpperCase()} · ${stat.size} bytes]`,
      });
    }
    const content = await fs.readFile(resolved, "utf8");
    return NextResponse.json({
      path: resolved, name: path.basename(resolved), size: stat.size,
      mtime: stat.mtimeMs, language: LANG_BY_EXT[ext] ?? "text", content,
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
