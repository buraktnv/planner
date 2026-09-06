import { NextResponse } from "next/server";
import { listNotes } from "@/lib/core/knowledge";
import { loadWorkspace, type CardModel, type SubModel } from "@/lib/view/workspace";
import type { MentionCatalog } from "@/lib/view/mentions";

export const dynamic = "force-dynamic";

/**
 * Everything the chat's `@` picker may offer, in one call. Tasks are listed
 * per charter everywhere else; the picker needs all of them at once, and the
 * rail cannot reach `lib/core` itself.
 */
export async function GET() {
  try {
    const [notes, ws] = await Promise.all([listNotes(), loadWorkspace()]);
    const tasks: MentionCatalog["tasks"] = [];
    const walk = (card: CardModel, subs: SubModel[]) => {
      for (const s of subs) {
        if (s.done) continue;
        tasks.push({ type: card.type, slug: card.slug, id: s.id, title: s.title, charterName: card.charterName });
        walk(card, s.subs);
      }
    };
    for (const card of ws.cards) {
      if (card.archived || card.done) continue;
      tasks.push({
        type: card.type,
        slug: card.slug,
        id: card.id,
        title: card.title,
        charterName: card.charterName,
      });
      walk(card, card.subs);
    }
    const catalog: MentionCatalog = {
      notes: notes.map((n) => ({ id: n.id, title: n.title })),
      tasks,
      charters: ws.charters.map((c) => ({ type: c.type, slug: c.id, name: c.name })),
    };
    return NextResponse.json(catalog);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
