import { NextResponse } from "next/server";
import { addGrocery, clearBoughtGroceries } from "@/lib/core/daily";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: unknown; cat?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const cat = typeof body.cat === "string" && body.cat.trim() ? body.cat.trim() : "Other";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    return NextResponse.json(await addGrocery(name, cat));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    const removed = await clearBoughtGroceries();
    return NextResponse.json({ removed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
