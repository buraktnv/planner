import { NextResponse } from "next/server";
import { setMealServings } from "@/lib/core/daily";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = (await req.json()) as { servings?: unknown };
    if (typeof body.servings !== "number") {
      return NextResponse.json({ error: "servings must be a number" }, { status: 400 });
    }
    return NextResponse.json(await setMealServings(id, body.servings));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
