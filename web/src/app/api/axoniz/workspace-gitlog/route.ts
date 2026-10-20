import { NextRequest, NextResponse } from "next/server";
import { execSync } from "node:child_process";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ROOT = "/home/z/my-project/AXONIZ";
const DEFAULT_WORKSPACE = "/home/z/my-project/AXONIZ";

interface GitLogEntry { hash: string; author: string; date: string; subject: string; }
interface GitStat {
  branch: string; ahead: number; behind: number; dirty: boolean;
  staged: number; modified: number; untracked: number; head: string;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const requested = sp.get("path") ?? DEFAULT_WORKSPACE;
  const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10) || 20, 100);

  const resolved = path.isAbsolute(requested)
    ? path.normalize(requested)
    : path.resolve(DEFAULT_WORKSPACE, requested);

  if (!resolved.startsWith(SAFE_ROOT)) {
    return NextResponse.json({ error: "Path outside workspace." }, { status: 403 });
  }

  const safe = (cmd: string) => {
    try {
      return execSync(cmd, {
        cwd: resolved, encoding: "utf8", timeout: 4000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch { return null; }
  };

  if (safe("git rev-parse --is-inside-work-tree") !== "true") {
    return NextResponse.json({ isGitRepo: false, log: [], status: null });
  }

  const logRaw = safe(`git log -n ${limit} --pretty=format:'%H%x1f%an%x1f%cI%x1f%s'`);
  const log: GitLogEntry[] = logRaw
    ? logRaw.split("\n").map((line) => {
        const [hash, author, date, subject] = line.split("\x1f");
        return { hash, author, date, subject };
      })
    : [];

  const branch = safe("git rev-parse --abbrev-ref HEAD") ?? "HEAD";
  const head = safe("git rev-parse --short HEAD") ?? "";
  const statusRaw = safe("git status --porcelain=v1 -b") ?? "";
  const statusLines = statusRaw.split("\n").filter(Boolean);

  let ahead = 0, behind = 0;
  const m = statusRaw.match(/ahead (\d+)|behind (\d+)/);
  if (m) { ahead = parseInt(m[1] ?? "0", 10); behind = parseInt(m[2] ?? "0", 10); }

  let staged = 0, modified = 0, untracked = 0;
  for (const l of statusLines.slice(1)) {
    const x = l[0], y = l[1];
    if (x === "A" || x === "M" || x === "D" || x === "R" || x === "C") staged++;
    if (y === "M" || y === "D") modified++;
    if (x === "?" && y === "?") untracked++;
  }

  const status: GitStat = {
    branch, ahead, behind, dirty: staged + modified + untracked > 0,
    staged, modified, untracked, head,
  };

  return NextResponse.json({ isGitRepo: true, log, status });
}
