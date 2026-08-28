import { NextResponse } from "next/server";
import { appendJournal, readJournal } from "@/lib/core/journal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(365, Math.round(raw))) : 30;
  return NextResponse.json(await readJournal(days));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { scope?: unknown; message?: unknown };
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!scope) return NextResponse.json({ error: "scope is required" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
    await appendJournal(scope, message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
