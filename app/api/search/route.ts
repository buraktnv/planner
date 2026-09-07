import { NextResponse } from "next/server";
import { getSearchIndex } from "@/lib/core/search-index";
import { rankSearch } from "@/lib/view/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const raw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 100) : undefined;
    const items = await getSearchIndex();
    return NextResponse.json({ hits: rankSearch(items, q, limit) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
