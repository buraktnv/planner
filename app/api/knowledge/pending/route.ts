import { NextResponse } from "next/server";
import { resolvePending, runDistillIfDue } from "@/lib/ai/auto-distill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const proposal = await runDistillIfDue();
  return NextResponse.json({ proposal: proposal ?? null });
}

export async function DELETE(req: Request) {
  let outcome: "accepted" | "discarded" = "discarded";
  let count = 0;
  try {
    const body = (await req.json()) as { outcome?: string; count?: number };
    if (body.outcome === "accepted") outcome = "accepted";
    if (typeof body.count === "number") count = body.count;
  } catch {
    outcome = "discarded";
  }
  await resolvePending(outcome, count);
  return NextResponse.json({ ok: true });
}
