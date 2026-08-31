import { NextResponse } from "next/server";
import { z } from "zod";
import { proposalActionSchema } from "@/lib/ai/schemas";
import { applyProposal } from "@/lib/ai/proposals";
import { claimProposal, recordOutcome, releaseProposal } from "@/lib/core/proposals";
import { outcomeText } from "@/lib/view/proposals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Apply a filed proposal.
 *
 * Same contract as `/api/proposals/apply` — it trusts only `actions`, so a
 * client-edited or filtered subset is legal — with one addition that matters:
 * the proposal is **claimed first**.
 *
 * Durability plus a URL makes two readers of the same proposal an ordinary
 * case, and nothing in the write path is idempotent: `addTask` mints a fresh id
 * every call, so two applies produce duplicates rather than an error. Recording
 * the outcome afterwards would leave exactly that window open, so the
 * `pending → applying` transition happens before a single action runs.
 */
const bodySchema = z.object({ actions: z.array(proposalActionSchema).min(1) });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid actions: ${parsed.error.issues.map((i) => i.message).join("; ")}` },
      { status: 400 },
    );
  }

  const claim = await claimProposal(id);
  if (!claim.ok) {
    return NextResponse.json({ error: claim.reason }, { status: 409 });
  }

  const actions = parsed.data.actions;
  let result;
  try {
    // Never inside a lock: applyProposal calls writers that each take the lock,
    // and the lock is not re-entrant, so wrapping this would deadlock.
    result = await applyProposal(actions);
  } catch (e) {
    await releaseProposal(id);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await recordOutcome(
    id,
    result.failedIndex === null ? "applied" : "partial",
    outcomeText(result.applied, actions.length, result.failedIndex),
  );

  return NextResponse.json(result);
}
