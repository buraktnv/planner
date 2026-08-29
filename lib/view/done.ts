import type { CardModel, Workspace } from "./workspace";

export type DoneBucketKey = "this-week" | "last-week" | "earlier" | "undated";

export interface DoneBucket {
  key: DoneBucketKey;
  label: string;
  cards: CardModel[];
}

export interface DoneModel {
  buckets: DoneBucket[];
  total: number;
  thisWeek: number;
  charters: { slug: string; name: string; color: string; count: number }[];
}

const BUCKET_LABEL: Record<DoneBucketKey, string> = {
  "this-week": "THIS WEEK",
  "last-week": "LAST WEEK",
  earlier: "EARLIER",
  undated: "NO DATE",
};

const BUCKET_ORDER: DoneBucketKey[] = ["this-week", "last-week", "earlier", "undated"];

export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toLocaleDateString("sv").slice(0, 10);
}

export function bucketOf(doneDate: string | undefined, today: string): DoneBucketKey {
  if (!doneDate) return "undated";
  const thisWeek = weekStart(today);
  if (doneDate >= thisWeek) return "this-week";
  const lastWeek = weekStart(
    new Date(new Date(`${thisWeek}T00:00:00`).getTime() - 86400000)
      .toLocaleDateString("sv")
      .slice(0, 10),
  );
  return doneDate >= lastWeek ? "last-week" : "earlier";
}

export function buildDone(ws: Workspace, extra: CardModel[] = []): DoneModel {
  const cards = [...ws.charters.flatMap((c) => c.cards), ...extra].filter((c) => c.done);
  cards.sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? "") || a.key.localeCompare(b.key));

  const buckets: DoneBucket[] = BUCKET_ORDER.map((key) => ({
    key,
    label: BUCKET_LABEL[key],
    cards: cards.filter((c) => bucketOf(c.doneDate, ws.today) === key),
  })).filter((b) => b.cards.length > 0);

  const byCharter = new Map<string, { slug: string; name: string; color: string; count: number }>();
  for (const c of cards) {
    const entry = byCharter.get(c.slug);
    if (entry) entry.count += 1;
    else byCharter.set(c.slug, { slug: c.slug, name: c.charterName, color: c.color, count: 1 });
  }

  return {
    buckets,
    total: cards.length,
    thisWeek: cards.filter((c) => bucketOf(c.doneDate, ws.today) === "this-week").length,
    charters: [...byCharter.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

export function doneNote(model: DoneModel): string {
  if (model.total === 0) return "Nothing finished yet. This fills up as you tick things off.";
  if (model.thisWeek === 0) return `${model.total} finished, none this week. A quiet stretch.`;
  const noun = model.thisWeek === 1 ? "thing" : "things";
  return `${model.thisWeek} ${noun} finished this week, ${model.total} in all.`;
}
