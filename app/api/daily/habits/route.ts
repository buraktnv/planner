import { NextResponse } from "next/server";
import { addHabit } from "@/lib/core/daily";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: unknown; goal?: unknown; unit?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const goal = typeof body.goal === "number" ? body.goal : 1;
    const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : undefined;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    return NextResponse.json(await addHabit(name, goal, unit));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
