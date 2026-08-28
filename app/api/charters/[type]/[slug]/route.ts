import { NextResponse } from "next/server";
import { archiveCharter, getCharter, updateCharter } from "@/lib/core/store";
import type { Charter, ProjectStatus, ProjectType } from "@/lib/core/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ type: string; slug: string }> };

const TYPES: ProjectType[] = ["project", "area"];
const STATUSES: ProjectStatus[] = ["active", "paused", "done", "abandoned"];

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

export async function GET(req: Request, { params }: Ctx) {
  const { type, slug } = await params;
  if (!TYPES.includes(type as ProjectType)) {
    return NextResponse.json({ error: "type must be project or area" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getCharter(type as ProjectType, slug));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { type, slug } = await params;
  if (!TYPES.includes(type as ProjectType)) {
    return NextResponse.json({ error: "type must be project or area" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateCharter>[2] = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (STATUSES.includes(body.status as ProjectStatus)) patch.status = body.status as ProjectStatus;
    if (typeof body.priority === "number" && Number.isFinite(body.priority)) {
      patch.priority = body.priority;
    }
    if (typeof body.mvp === "string") patch.mvp = body.mvp;
    if (typeof body.repo === "string") patch.repo = body.repo;
    if (typeof body.why === "string" && body.why.trim()) patch.why = body.why;
    const mvpScope = stringList(body.mvpScope);
    if (mvpScope) patch.mvpScope = mvpScope;
    const parkingLot = stringList(body.parkingLot);
    if (parkingLot) patch.parkingLot = parkingLot;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no supported fields in patch" }, { status: 400 });
    }
    const charter: Charter = await updateCharter(type as ProjectType, slug, patch);
    return NextResponse.json(charter);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { type, slug } = await params;
  if (!TYPES.includes(type as ProjectType)) {
    return NextResponse.json({ error: "type must be project or area" }, { status: 400 });
  }
  try {
    await archiveCharter(type as ProjectType, slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
