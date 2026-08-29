import { readAsset } from "@/lib/core/assets";

// fs is unavailable on the edge runtime, and the data directory is local.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One path segment, never a catch-all: an asset name has no directories in it,
 * so there is no traversal to defend against. Anything that fails validation
 * is a plain 404 that does not echo the attempted name back.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const asset = await readAsset(name);
  if (!asset) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      // From a fixed extension map — never sniffed, never from the request.
      "content-type": asset.mime,
      "content-length": String(asset.bytes.length),
      "x-content-type-options": "nosniff",
      // Names are content-addressed, so the bytes behind one can never change.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
