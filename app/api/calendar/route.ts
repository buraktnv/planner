import { NextResponse } from "next/server";
import { addEvent, listEvents } from "@/lib/core/calendar";

export const dynamic = "force-dynamic";

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  try {
    return NextResponse.json(await listEvents({ from, to }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const date = text(body.date)?.trim() ?? "";
    const title = text(body.title)?.trim() ?? "";
    if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const event = await addEvent({
      date,
      title,
      time: text(body.time),
      note: text(body.note),
      scope: text(body.scope),
      action: text(body.action),
    });
    return NextResponse.json(event);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
