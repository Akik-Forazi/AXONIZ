import { NextResponse } from "next/server";
import { createAgent } from "@/lib/axoniz/cli-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/axoniz/health
 *
 * Returns the real AXONIZ agent health — backend status, loaded model,
 * memory palace drawer count, knowledge graph fact count, uptime.
 */
export async function GET() {
  try {
    const agent = createAgent();
    if (!agent) {
      return NextResponse.json(
        {
          status: "offline",
          backend: null,
          model: null,
          message: "AXONIZ dist/ not loaded. Run `cd AXONIZ && npm run build:cli`.",
        },
        { status: 503 },
      );
    }
    const health = await agent.health();
    return NextResponse.json({
      status: "active",
      ...health,
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", error: (e as Error).message },
      { status: 500 },
    );
  }
}
