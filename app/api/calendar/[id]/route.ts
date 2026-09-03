import { NextResponse } from "next/server";
import { updateEvent } from "@/lib/core/calendar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateEvent>[1] = {};
    if (typeof body.date === "string") patch.date = body.date;
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.time === "string") patch.time = body.time;
    if (typeof body.note === "string") patch.note = body.note;
    if (typeof body.scope === "string") patch.scope = body.scope;
    if (typeof body.action === "string") patch.action = body.action;
    if (typeof body.repeat === "string") patch.repeat = body.repeat;
    if (typeof body.lead === "number") patch.lead = body.lead;
    if (typeof body.done === "boolean") patch.done = body.done;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no supported fields in patch" }, { status: 400 });
    }
    return NextResponse.json(await updateEvent(id, patch));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
