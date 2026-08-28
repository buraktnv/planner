import { NextResponse } from "next/server";
import { readNote, updateNote } from "@/lib/core/knowledge";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return NextResponse.json(await readNote(id));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateNote>[1] = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.summary === "string") patch.summary = body.summary;
    if (typeof body.body === "string") patch.body = body.body;
    if (typeof body.source === "string") patch.source = body.source;
    const scope = stringList(body.scope);
    if (scope) patch.scope = scope;
    const tags = stringList(body.tags);
    if (tags) patch.tags = tags;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no supported fields in patch" }, { status: 400 });
    }
    return NextResponse.json(await updateNote(id, patch));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
