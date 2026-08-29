import { NextResponse } from "next/server";
import { listArchived } from "@/lib/core/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listArchived());
}
