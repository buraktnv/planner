import { NextResponse } from "next/server";
import { fetchCatalog, isCatalogSource } from "@/lib/core/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "openrouter";
  if (!isCatalogSource(source)) {
    return NextResponse.json(
      { error: "source must be openrouter or deepseek" },
      { status: 400 },
    );
  }
  const refresh = url.searchParams.get("refresh") === "1";
  const result = await fetchCatalog(source, { refresh });
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const models = q
    ? result.models.filter(
        (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      )
    : result.models;
  return NextResponse.json({ models, error: result.error, fetchedAt: result.fetchedAt });
}
