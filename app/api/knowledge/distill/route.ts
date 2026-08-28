import { NextResponse } from "next/server";
import { getProviders } from "@/lib/core/providers";
import { DistillError, distillJournal } from "@/lib/ai/distill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { days?: number; profileId?: string } = {};
  try {
    body = (await req.json()) as { days?: number; profileId?: string };
  } catch {
    body = {};
  }

  try {
    const providers = await getProviders();
    const proposal = await distillJournal({
      providers,
      days: body.days,
      profileId: body.profileId,
    });
    if (!proposal) {
      return NextResponse.json({
        proposal: null,
        message: "Nothing durable in the journal for that window. Not everything deserves a note.",
      });
    }
    return NextResponse.json({ proposal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: e instanceof DistillError ? 400 : 500 });
  }
}
