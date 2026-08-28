import { NextResponse } from "next/server";
import { indexLine, listNotes, searchNotes } from "@/lib/core/knowledge";
import { fileNote } from "@/lib/ai/file-note";

export const dynamic = "force-dynamic";

function splitList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const out = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const scope = url.searchParams.get("scope") ?? undefined;
  const tags = splitList(url.searchParams.get("tags"));
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    if (q) {
      const hits = await searchNotes({ q, scope, tags, limit });
      return NextResponse.json({ hits });
    }
    const notes = await listNotes();
    const filtered = notes.filter((n) => {
      if (scope && !n.scope.includes(scope)) return false;
      if (tags && !tags.every((t) => n.tags.includes(t))) return false;
      return true;
    });
    return NextResponse.json({
      total: notes.length,
      notes: filtered.map((n) => ({
        id: n.id,
        title: n.title,
        summary: n.summary,
        scope: n.scope,
        tags: n.tags,
        created: n.created,
        updated: n.updated,
        line: indexLine(n),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      summary?: string;
      body?: string;
      scope?: string[];
      tags?: string[];
      source?: string;
    };
    if (!body.summary) {
      return NextResponse.json({ error: "summary is required" }, { status: 400 });
    }
    const filed = await fileNote({
      title: body.title,
      summary: body.summary,
      body: body.body,
      scope: body.scope,
      tags: body.tags,
      source: body.source,
    });
    return NextResponse.json({ ...filed.note, scopeMethod: filed.scopeMethod });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
