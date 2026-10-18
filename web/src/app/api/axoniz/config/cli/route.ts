import { NextRequest, NextResponse } from "next/server";
import { loadCliConfig, saveCliConfig } from "@/lib/axoniz/cli-bridge";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Read the CLI's canonical config from ~/.axoniz/config.json.
 * API keys are redacted to "[REDACTED]" so they don't leak to the browser
 * on every config pull. The frontend boot code converts "[REDACTED]" back
 * to "" so the form shows an empty field, and the save route skips empty
 * api_key values to preserve whatever's already on disk.
 */
export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = loadCliConfig();
  const redacted = JSON.parse(JSON.stringify(cfg));
  try {
    const providers = redacted?.llm?.providers;
    if (providers) for (const key of Object.keys(providers)) {
      const p = providers[key];
      if (p && typeof p === "object" && p.api_key) p.api_key = "[REDACTED]";
    }
  } catch { /* ignore */ }
  return NextResponse.json(redacted);
}

/**
 * Merge-patch the CLI config. Performs a deep merge so that partial updates
 * (e.g. only {llm:{providers:{openai:{base_url}}}}) don't wipe out the rest
 * of the config (agent settings, memory, swarm_models, etc).
 *
 * CRITICAL — redaction round-trip safety:
 * If the frontend bootstrapped with `api_key: "[REDACTED]"`, the form shows
 * an empty apiKey field. The save handler omits api_key from the patch when
 * the field is blank (see provider-detail.tsx save()). As a defense-in-depth
 * measure, we ALSO strip any incoming `api_key` value that is empty OR
 * equal to the literal "[REDACTED]" sentinel — so a stale client posting the
 * redacted form back cannot destroy the stored key.
 *
 * Returns { ok: true } on success, or { error: string } with 500/503 on
 * save failure (previously the cli-bridge swallowed all errors and the
 * route returned ok:true regardless — that hid broken config writes).
 */
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let patch: Record<string, unknown>;
  try { patch = (await req.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Defense-in-depth: scrub redacted/empty api_key values from the patch so
  // they can't overwrite the real key on disk.
  scrubRedactedApiKeys(patch);

  const current = loadCliConfig();
  const merged = deepMerge(current, patch);
  try {
    saveCliConfig(merged);
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to save config: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

/**
 * Walk a patch object and strip out any `api_key` field whose value is
 * empty, "[REDACTED]", or null. Operates recursively into nested objects
 * (handles llm.providers.{openai}.api_key and any other layout).
 *
 * Mutates `node` in place. Returns true if the api_key was stripped.
 */
function scrubRedactedApiKeys(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (k === "api_key") {
      if (typeof v !== "string" || v.trim() === "" || v === "[REDACTED]") {
        delete rec.api_key;
      }
    } else if (v && typeof v === "object") {
      scrubRedactedApiKeys(v);
    }
  }
}

/**
 * Structural deep merge — for each key in `patch`, recursively merge into
 * `target`. Arrays are replaced (not concatenated). Primitive values in
 * `patch` overwrite `target`. Returns a new merged object; inputs are not
 * mutated.
 *
 * This is intentionally stricter than Object.assign()'s shallow replace —
 * the previous POST handler did `merged = { ...current, ...patch }` which
 * means patching `{llm:{providers:{openai:{api_key:"sk-..."}}}}` would
 * wipe out current.llm.providers.llamacpp, current.llm.active_provider,
 * and every other nested key.
 */
function deepMerge<T>(target: T, patch: unknown): T {
  if (patch === null || patch === undefined) return target;
  if (typeof patch !== "object") return patch as T;
  if (Array.isArray(patch)) return patch as T; // arrays: replace, don't concat
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    // Target is primitive but patch is object — patch wins.
    return patch as T;
  }
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = (target as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v)
        && cur && typeof cur === "object" && !Array.isArray(cur)) {
      out[k] = deepMerge(cur, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}
