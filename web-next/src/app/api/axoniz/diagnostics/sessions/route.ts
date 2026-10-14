/**
 * GET /api/axoniz/diagnostics/sessions
 *
 * Returns the list of .axolog files in ~/.axoniz/logs/ — mirrors the
 * CLI `axoniz logs list` command for the dashboard Diagnostics page.
 *
 * Response:
 *   200 { sessions: [{ name, path, sizeBytes, sizeStr, mtimeIso, mtimeStr }] }
 */

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getDiagLogDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".axoniz", "logs");
}

export async function GET() {
  const dir = getDiagLogDir();
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const sessions = entries
      .filter(e => e.isFile() && e.name.endsWith(".axolog"))
      .map(e => {
        const p = path.join(dir, e.name);
        try {
          const st = fs.statSync(p);
          const sizeBytes = st.size;
          const sizeStr = sizeBytes < 1024
            ? `${sizeBytes}B`
            : sizeBytes < 1024 * 1024
              ? `${(sizeBytes / 1024).toFixed(1)}KB`
              : `${(sizeBytes / 1024 / 1024).toFixed(1)}MB`;
          return {
            name: e.name,
            path: p,
            sizeBytes,
            sizeStr,
            mtimeIso: st.mtime.toISOString(),
            mtimeStr: st.mtime.toISOString().replace("T", " ").slice(0, 19),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.mtimeIso.localeCompare(a.mtimeIso));
    return NextResponse.json({ sessions, directory: dir });
  } catch (e) {
    return NextResponse.json(
      {
        sessions: [],
        directory: dir,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 200 },
    );
  }
}
