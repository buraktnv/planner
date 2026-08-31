import { NextResponse } from "next/server";
import { appendComment, readComments } from "@/lib/core/comments";
import type { ProjectType } from "@/lib/core/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ type: string; slug: string; taskId: string }> };

const TYPES: ProjectType[] = ["project", "area"];

export async function GET(req: Request, { params }: Ctx) {
  const { type, slug, taskId } = await params;
  if (!TYPES.includes(type as ProjectType)) {
    return NextResponse.json({ error: "type must be project or area" }, { status: 400 });
  }
  try {
    const entries = await readComments(type as ProjectType, slug, taskId);
    return NextResponse.json({ taskId, entries });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * There is no PUT and no DELETE, and that is the feature: the log is
 * append-only because no route exists to change an entry, not because a flag
 * somewhere says so.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { type, slug, taskId } = await params;
  if (!TYPES.includes(type as ProjectType)) {
    return NextResponse.json({ error: "type must be project or area" }, { status: 400 });
  }
  try {
    const payload = (await req.json()) as Record<string, unknown>;
    if (typeof payload.body !== "string") {
      return NextResponse.json({ error: "body must be a string" }, { status: 400 });
    }
    await appendComment(type as ProjectType, slug, taskId, payload.body);
    const entries = await readComments(type as ProjectType, slug, taskId);
    return NextResponse.json({ taskId, entries });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
