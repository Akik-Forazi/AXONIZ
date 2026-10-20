import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_DIR = path.join(os.homedir(), ".axoniz", "history");

interface SessionMeta { id: string; title: string; ts: string; path?: string; messageCount?: number; }

export async function GET() {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const jsonls = files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const m = f.match(/^session_(\d{8})_(\d{6})/);
        let ts: string | null = null;
        if (m) {
          const [_, d, t] = m;
          ts = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
        }
        return { file: f, ts };
      })
      .sort((a, b) => (a.ts && b.ts ? b.ts.localeCompare(a.ts) : 0));

    const out: SessionMeta[] = [];
    for (const { file, ts } of jsonls.slice(0, 50)) {
      const fullPath = path.join(HISTORY_DIR, file);
      let title = file.replace(/\.jsonl$/, "").replace(/_/g, " ");
      let messageCount = 0;
      try {
        const metaPath = fullPath.replace(/\.jsonl$/, ".meta.json");
        const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
        if (meta?.title) title = meta.title;
      } catch {
        try {
          const raw = await fs.readFile(fullPath, "utf8");
          const lines = raw.split("\n").filter(Boolean);
          messageCount = lines.length;
          for (const line of lines.slice(0, 8)) {
            try {
              const e = JSON.parse(line);
              if (e.role === "user" && typeof e.content === "string") {
                title = e.content.slice(0, 80);
                break;
              }
            } catch { /* skip */ }
          }
        } catch { /* keep defaults */ }
      }
      out.push({
        id: file.replace(/\.jsonl$/, ""),
        title, ts: ts ?? new Date().toISOString(),
        path: fullPath, messageCount,
      });
    }
    return NextResponse.json({ sessions: out });
  } catch {
    return NextResponse.json({ sessions: [] });
  }
}
