import { NextResponse } from "next/server";
import { listProposals } from "@/lib/core/proposals";
import { pendingCount, toRow } from "@/lib/view/proposals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * How many proposals are waiting. The rail polls this to show its chip, because
 * `/proposals` is reachable by URL only — an inbox nothing points at is a drawer
 * things rot in.
 *
 * Counts through `toRow`, so a proposal whose actions no longer validate is not
 * advertised as something to go and act on.
 */
export async function GET() {
  try {
    const rows = (await listProposals()).map(toRow);
    return NextResponse.json({ pending: pendingCount(rows) });
  } catch {
    // A broken inbox must not break the rail that renders the chip.
    return NextResponse.json({ pending: 0 });
  }
}
