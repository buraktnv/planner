import { NextResponse } from "next/server";
import { getArchived, listArchivedTasks, restoreCharter } from "@/lib/core/store";
import type { ProjectType } from "@/lib/core/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ type: string; name: string }> };

const TYPES: ProjectType[] = ["project", "area"];

export async function GET(req: Request, { params }: Ctx) {
  const { type, name } = await params;
  if (!TYPES.includes(type as ProjectType)) {
    return NextResponse.json({ error: "type must be project or area" }, { status: 400 });
  }
  try {
    const charter = await getArchived(type as ProjectType, name);
    const tasks = await listArchivedTasks(type as ProjectType, name);
    return NextResponse.json({ charter, tasks });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { type, name } = await params;
  if (!TYPES.includes(type as ProjectType)) {
    return NextResponse.json({ error: "type must be project or area" }, { status: 400 });
  }
  try {
    const restored = await restoreCharter(type as ProjectType, name);
    return NextResponse.json({ ok: true, ...restored });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
