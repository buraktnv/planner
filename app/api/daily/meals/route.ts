import { NextResponse } from "next/server";
import { addMeal } from "@/lib/core/daily";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: unknown; servings?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const servings = typeof body.servings === "number" ? body.servings : 1;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    return NextResponse.json(await addMeal(name, servings));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
