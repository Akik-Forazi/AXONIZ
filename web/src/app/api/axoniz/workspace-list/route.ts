import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ROOT = "/home/z/my-project/AXONIZ";
const DEFAULT_WORKSPACE = "/home/z/my-project/AXONIZ";

const IGNORE = new Set([
  "node_modules", ".next", ".git", "dist", "build", ".cache",
  ".turbo", "coverage", "__pycache__", ".venv", "venv",
]);

interface Entry {
  path: string; name: string; kind: "file" | "dir";
  size: number; mtime: number; ext?: string; depth: number;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const requested = sp.get("path") ?? DEFAULT_WORKSPACE;
  const depth = Math.min(parseInt(sp.get("depth") ?? "3", 10) || 3, 4);

  const resolved = path.isAbsolute(requested)
    ? path.normalize(requested)
    : path.resolve(DEFAULT_WORKSPACE, requested);

  if (!resolved.startsWith(SAFE_ROOT)) {
    return NextResponse.json({ error: "Path outside workspace." }, { status: 403 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const entries: Entry[] = [];
  async function walk(dir: string, currentDepth: number) {
    if (currentDepth > depth) return;
    let names: string[];
    try { names = await fs.readdir(dir); } catch { return; }
    for (const name of names) {
      if (IGNORE.has(name)) continue;
      if (name.startsWith(".") && currentDepth > 1) continue;
      const full = path.join(dir, name);
      try {
        const st = await fs.stat(full);
        const rel = path.relative(resolved, full);
        const e: Entry = {
          path: rel || name, name, kind: st.isDirectory() ? "dir" : "file",
          size: st.size, mtime: st.mtimeMs, depth: currentDepth,
        };
        if (e.kind === "file") {
          const ext = path.extname(name).slice(1).toLowerCase();
          if (ext) e.ext = ext;
        }
        entries.push(e);
        if (st.isDirectory()) await walk(full, currentDepth + 1);
      } catch { /* skip */ }
    }
  }
  await walk(resolved, 1);
  entries.sort((a, b) => a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name));
  return NextResponse.json({ root: resolved, rootName: path.basename(resolved), entries });
}
