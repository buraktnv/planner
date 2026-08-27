import { NextResponse } from "next/server";
import type { TaskSize } from "@/lib/core/types";
import { listTasks, addTask, updateTask } from "@/lib/core/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const SIZES: TaskSize[] = ["S", "M", "L"];

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const tasks = await listTasks("project", slug);
  return NextResponse.json(tasks);
}

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  try {
    const body = (await req.json()) as {
      title?: unknown;
      size?: unknown;
      parentId?: unknown;
      est?: unknown;
      due?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!SIZES.includes(body.size as TaskSize)) {
      return NextResponse.json({ error: "size must be S, M or L" }, { status: 400 });
    }
    const task = await addTask("project", slug, {
      title,
      size: body.size as TaskSize,
      parentId: typeof body.parentId === "string" && body.parentId ? body.parentId : undefined,
      est: typeof body.est === "string" ? body.est : undefined,
      due: typeof body.due === "string" ? body.due : undefined,
    });
    return NextResponse.json(task);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { slug } = await params;
  try {
    const body = (await req.json()) as {
      id?: unknown;
      complete?: boolean;
      title?: unknown;
      size?: unknown;
      section?: unknown;
      est?: unknown;
      due?: unknown;
    };
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const patch: Parameters<typeof updateTask>[3] = {};
    if (body.complete !== undefined) patch.complete = body.complete;
    if (typeof body.title === "string") patch.title = body.title;
    if (SIZES.includes(body.size as TaskSize)) patch.size = body.size as TaskSize;
    if (typeof body.section === "string") patch.section = body.section as never;
    if (typeof body.est === "string") patch.est = body.est;
    if (typeof body.due === "string") patch.due = body.due;
    const task = await updateTask("project", slug, id, patch);
    return NextResponse.json(task);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
