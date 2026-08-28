import { NextResponse } from "next/server";
import { getDaily } from "@/lib/core/daily";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDaily());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
