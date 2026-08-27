import { NextResponse } from "next/server";
import { listCharters, createCharter } from "@/lib/core/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const charters = await listCharters("project");
  return NextResponse.json(charters);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: unknown;
      why?: unknown;
      mvp?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const why = typeof body.why === "string" ? body.why.trim() : "";
    const mvp = typeof body.mvp === "string" ? body.mvp.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!why) return NextResponse.json({ error: "why is required" }, { status: 400 });
    if (!mvp) return NextResponse.json({ error: "mvp is required" }, { status: 400 });
    const charter = await createCharter({ type: "project", name, why, mvp });
    return NextResponse.json(charter);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
