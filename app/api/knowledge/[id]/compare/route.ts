import { NextResponse } from "next/server";
import { getProviders } from "@/lib/core/providers";
import { DistillError } from "@/lib/ai/distill";
import { compareNote } from "@/lib/ai/compare-note";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { profileId?: string } = {};
  try {
    body = (await req.json()) as { profileId?: string };
  } catch {
    body = {};
  }

  try {
    const providers = await getProviders();
    const outcome = await compareNote({ id, providers, profileId: body.profileId });
    return NextResponse.json(outcome);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = e instanceof DistillError ? 400 : /Note not found/.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
