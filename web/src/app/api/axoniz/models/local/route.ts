/**
 * Scans %LOCALAPPDATA%\FRAZIYM\axoniz\models for .gguf files and returns them with clean names.
 * This is a filesystem scan — no HTTP, no provider connection needed.
 *
 * AUTH: requires Bearer JWT — exposes the user's local file inventory.
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireAuth } from "@/lib/axoniz/auth-guard";
import { axonizLocal } from "@/lib/axoniz/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatModelName(raw: string): string {
  let s = raw;
  s = s.replace(/\.(gguf|bin|onnx)$/i, "");
  s = s.replace(/\.?[IQ]\d+(_[A-Za-z]+)*$/i, "");
  s = s.replace(/-\d+-of-\d+$/i, "");
  s = s.replace(/[-_]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.split(" ").map(w => w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  s = s.replace(/\bIt\b/g, "IT");
  return s || raw;
}

function getFileSize(filepath: string): string {
  try {
    const stats = fs.statSync(filepath);
    const gb = stats.size / 1e9;
    const mb = stats.size / 1e6;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${mb.toFixed(0)} MB`;
  } catch { return "—"; }
}

function scanModels(dir: string, depth = 0): Array<{id: string; name: string; size: string; path: string}> {
  if (depth > 3) return [];
  const results: Array<{id: string; name: string; size: string; path: string}> = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanModels(full, depth + 1));
      } else if (entry.name.toLowerCase().endsWith(".gguf") || entry.name.toLowerCase().endsWith(".bin")) {
        results.push({
          id: entry.name,
          name: formatModelName(entry.name),
          size: getFileSize(full),
          path: full,
        });
      }
    }
  } catch { /* dir not found or not readable */ }
  return results;
}

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const modelsDir = path.join(axonizLocal(), "models");
  const models = scanModels(modelsDir);
  return NextResponse.json({ models, directory: modelsDir, count: models.length });
}
