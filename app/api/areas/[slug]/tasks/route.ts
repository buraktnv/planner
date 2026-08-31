import { NextResponse } from "next/server";
import type { TaskSize } from "@/lib/core/types";
import { listTasks, addTask, updateTask } from "@/lib/core/store";
import { writeDetail } from "@/lib/core/details";
import { isLane } from "@/lib/core/lanes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const SIZES: TaskSize[] = ["S", "M", "L"];

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const tasks = await listTasks("area", slug);
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
      lane?: unknown;
      target?: unknown;
      note?: unknown;
      waitsOn?: unknown;
      description?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!SIZES.includes(body.size as TaskSize)) {
      return NextResponse.json({ error: "size must be S, M or L" }, { status: 400 });
    }
    const task = await addTask("area", slug, {
      title,
      size: body.size as TaskSize,
      lane: isLane(body.lane) ? body.lane : undefined,
      parentId: typeof body.parentId === "string" && body.parentId ? body.parentId : undefined,
      est: typeof body.est === "string" ? body.est : undefined,
      due: typeof body.due === "string" ? body.due : undefined,
      target: typeof body.target === "string" && body.target.trim() ? body.target.trim() : undefined,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined,
      waitsOn: typeof body.waitsOn === "string" && body.waitsOn.trim() ? body.waitsOn.trim() : undefined,
    });
    // The description is a separate file, so it is written after addTask has
    // returned: both take the data lock and the lock is not re-entrant.
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    let descriptionSaved = true;
    if (description) {
      try {
        await writeDetail("area", slug, task.id, description);
      } catch {
        // The task is already created and committed. Failing the whole request
        // here would have the caller retry and create a duplicate, so report
        // the miss instead and let the task stand.
        descriptionSaved = false;
      }
    }
    return NextResponse.json({ ...task, descriptionSaved });
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
      lane?: unknown;
      target?: unknown;
      note?: unknown;
      waitsOn?: unknown;
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
    if (isLane(body.lane)) patch.lane = body.lane;
    if (typeof body.target === "string") patch.target = body.target.trim();
    if (typeof body.note === "string") patch.note = body.note.trim();
    if (typeof body.waitsOn === "string") patch.waitsOn = body.waitsOn.trim();
    const task = await updateTask("area", slug, id, patch);
    return NextResponse.json(task);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
