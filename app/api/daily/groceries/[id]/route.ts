import { NextResponse } from "next/server";
import { toggleGrocery } from "@/lib/core/daily";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { got?: unknown };
    const got = typeof body.got === "boolean" ? body.got : undefined;
    return NextResponse.json(await toggleGrocery(id, got));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
