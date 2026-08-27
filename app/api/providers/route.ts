import { NextResponse } from "next/server";
import { getProviders, saveProviders } from "@/lib/core/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await getProviders();
  return NextResponse.json(providers);
}

async function handleWrite(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    await saveProviders(body as never);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  return handleWrite(req);
}

export async function POST(req: Request) {
  return handleWrite(req);
}
