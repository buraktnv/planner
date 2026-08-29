import { NextResponse } from "next/server";
import { MAX_ASSET_BYTES, saveAsset } from "@/lib/core/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paste or drop an image. The only way bytes enter the data repo: the file is
 * copied in and committed, so it is backed up and works on another machine —
 * unlike a reference to wherever it happened to sit on this one.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }
    // Checked before reading it, so an oversized upload is refused rather than
    // pulled into memory first.
    if (file.size > MAX_ASSET_BYTES) {
      return NextResponse.json(
        { error: `Images are capped at ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB` },
        { status: 413 },
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const scope = typeof form.get("scope") === "string" ? String(form.get("scope")) : "assets";
    const saved = await saveAsset(bytes, scope);
    return NextResponse.json(saved);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
