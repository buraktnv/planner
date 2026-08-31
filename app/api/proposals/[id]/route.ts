import { NextResponse } from "next/server";
import { z } from "zod";
import { getProposal, recordOutcome } from "@/lib/core/proposals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Settle a proposal without applying it.
 *
 * Only `discarded` is accepted: `applied` and `partial` are written by the apply
 * route from a real result, and letting a client assert them would let the inbox
 * claim work that never happened.
 */
const bodySchema = z.object({ status: z.literal("discarded"), outcome: z.string().max(300).optional() });

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  return NextResponse.json(proposal);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "status must be \"discarded\"" }, { status: 400 });
  }

  const existing = await getProposal(id);
  if (!existing) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (existing.status === "applied" || existing.status === "partial") {
    return NextResponse.json({ error: `Proposal is already ${existing.status}` }, { status: 409 });
  }

  await recordOutcome(id, "discarded", parsed.data.outcome);
  return NextResponse.json({ ok: true });
}
