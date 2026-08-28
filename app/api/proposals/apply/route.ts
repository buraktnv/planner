import { NextResponse } from "next/server";
import { z } from "zod";
import { proposalActionSchema } from "@/lib/ai/schemas";
import { applyProposal } from "@/lib/ai/proposals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ actions: z.array(proposalActionSchema).min(1) });

export async function POST(req: Request) {
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

  try {
    return NextResponse.json(await applyProposal(parsed.data.actions));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
