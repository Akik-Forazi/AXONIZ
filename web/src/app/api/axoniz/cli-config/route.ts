import { NextRequest, NextResponse } from "next/server";
import { loadConfigWithAutodetect, saveCliConfig } from "@/lib/axoniz/cli-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/axoniz/config
 *
 * Returns the real AXONIZ config from ~/.axoniz/config.json (via cli-bridge).
 * API keys are redacted before sending to the browser.
 */
export async function GET() {
  try {
    const cfg = loadConfigWithAutodetect();
    // Redact API keys
    const redacted = JSON.parse(JSON.stringify(cfg));
    if (redacted.llm?.providers) {
      for (const p of Object.values(redacted.llm.providers) as Array<Record<string, unknown>>) {
        if (typeof p.api_key === "string" && p.api_key) {
          p.api_key = "[REDACTED]";
        }
      }
    }
    return NextResponse.json({
      config: redacted,
      _models_dir: redacted._models_dir ?? "~/.axoniz/models",
      _home: redacted._home ?? "~/.axoniz",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to load config: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

/**
 * POST /api/axoniz/config
 *
 * Deep-merges the patch into ~/.axoniz/config.json. Any api_key that is
 * empty, "[REDACTED]", or null is scrubbed before save (so a stale client
 * posting the redacted sentinel back doesn't wipe the real key).
 */
export async function POST(req: NextRequest) {
  try {
    const patch = await req.json();
    const cfg = loadConfigWithAutodetect();

    // Scrub redacted api_keys from the patch.
    function scrubRedacted(obj: unknown): void {
      if (typeof obj !== "object" || obj === null) return;
      if (Array.isArray(obj)) { obj.forEach(scrubRedacted); return; }
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (k === "api_key" && (v === "" || v === "[REDACTED]" || v === null)) {
          delete (obj as Record<string, unknown>)[k];
        } else if (typeof v === "object") {
          scrubRedacted(v);
        }
      }
    }
    scrubRedacted(patch);

    // Deep merge
    function deepMerge(target: Record<string, unknown>, src: Record<string, unknown>): Record<string, unknown> {
      for (const [k, v] of Object.entries(src)) {
        if (v === null) continue;
        if (typeof v === "object" && !Array.isArray(v)) {
          if (typeof target[k] !== "object" || Array.isArray(target[k]) || target[k] === null) {
            target[k] = {};
          }
          deepMerge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
        } else if (Array.isArray(v)) {
          target[k] = v;
        } else {
          target[k] = v;
        }
      }
      return target;
    }
    const merged = deepMerge(cfg as Record<string, unknown>, patch);
    saveCliConfig(merged as Parameters<typeof saveCliConfig>[0]);

    return NextResponse.json({ status: "saved" });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to save config: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
