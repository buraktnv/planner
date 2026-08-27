import { NextResponse } from "next/server";
import { getAbout, saveAbout } from "@/lib/core/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const about = await getAbout();
  return NextResponse.json({ about });
}

async function handleWrite(req: Request) {
  try {
    const body = (await req.json()) as { about?: unknown };
    if (typeof body.about !== "string") {
      return NextResponse.json({ error: "about must be a string" }, { status: 400 });
    }
    await saveAbout(body.about);
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
