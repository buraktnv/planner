import { describe, expect, it } from "vitest";
import { bucketOf, buildDone, doneNote, weekStart } from "../done";
import type { CardModel, CharterModel, Workspace } from "../workspace";

const TODAY = "2026-08-28";

function card(partial: Partial<CardModel> & { id: string }): CardModel {
  const slug = partial.slug ?? "alpha";
  const type = partial.type ?? "project";
  return {
    key: `${type}/${slug}/${partial.id}`,
    type,
    slug,
    charterName: partial.charterName ?? "Alpha",
    color: "#7d95dd",
    tint: "#e6eaf9",
    title: partial.title ?? `Task ${partial.id}`,
    size: "M",
    lane: "deep",
    section: "done",
    done: true,
    blocked: false,
    overdue: false,
    hasDetail: false,
    pct: 100,
    subDone: 0,
    subTotal: 0,
    subs: [],
    priority: "P2",
    ...partial,
  };
}

function ws(cards: CardModel[], today = TODAY): Workspace {
  const charter = { id: "alpha", name: "Alpha", cards } as unknown as CharterModel;
  return { today, charters: [charter], byId: new Map(), allCards: cards } as unknown as Workspace;
}

describe("weekStart", () => {
  it("returns the Monday of the ISO week", () => {
    expect(weekStart("2026-08-28")).toBe("2026-08-24");
    expect(weekStart("2026-08-24")).toBe("2026-08-24");
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-09-02")).toBe("2026-08-31");
    expect(weekStart("2026-03-01")).toBe("2026-02-23");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(weekStart("2026-08-30")).toBe("2026-08-24");
  });
});

describe("bucketOf", () => {
  it("splits this week, last week and earlier", () => {
    expect(bucketOf("2026-08-28", TODAY)).toBe("this-week");
    expect(bucketOf("2026-08-24", TODAY)).toBe("this-week");
    expect(bucketOf("2026-08-23", TODAY)).toBe("last-week");
    expect(bucketOf("2026-08-17", TODAY)).toBe("last-week");
    expect(bucketOf("2026-08-16", TODAY)).toBe("earlier");
  });

  it("buckets a missing done date separately", () => {
    expect(bucketOf(undefined, TODAY)).toBe("undated");
  });

  it("still splits correctly when last week is in the previous month", () => {
    expect(bucketOf("2026-08-31", "2026-09-02")).toBe("this-week");
    expect(bucketOf("2026-08-30", "2026-09-02")).toBe("last-week");
    expect(bucketOf("2026-08-23", "2026-09-02")).toBe("earlier");
  });
});

describe("buildDone", () => {
  it("keeps only done cards, newest first", () => {
    const model = buildDone(
      ws([
        card({ id: "T-001", doneDate: "2026-08-25" }),
        card({ id: "T-002", done: false, section: "backlog" }),
        card({ id: "T-003", doneDate: "2026-08-27" }),
      ]),
    );
    expect(model.total).toBe(2);
    expect(model.buckets[0].cards.map((c) => c.id)).toEqual(["T-003", "T-001"]);
  });

  it("groups into labelled buckets and drops empty ones", () => {
    const model = buildDone(
      ws([
        card({ id: "T-001", doneDate: "2026-08-27" }),
        card({ id: "T-002", doneDate: "2026-08-01" }),
      ]),
    );
    expect(model.buckets.map((b) => b.key)).toEqual(["this-week", "earlier"]);
    expect(model.buckets[0].label).toBe("THIS WEEK");
  });

  it("counts per charter, busiest first", () => {
    const model = buildDone(
      ws([
        card({ id: "T-001", slug: "alpha", charterName: "Alpha", doneDate: "2026-08-27" }),
        card({ id: "T-002", slug: "beta", charterName: "Beta", doneDate: "2026-08-26" }),
        card({ id: "T-003", slug: "beta", charterName: "Beta", doneDate: "2026-08-25" }),
      ]),
    );
    expect(model.charters.map((c) => [c.slug, c.count])).toEqual([
      ["beta", 2],
      ["alpha", 1],
    ]);
  });

  it("folds in extra cards from the archive", () => {
    const archived = card({ id: "T-009", slug: "old", charterName: "Old", doneDate: "2026-08-26" });
    const model = buildDone(ws([card({ id: "T-001", doneDate: "2026-08-27" })]), [archived]);
    expect(model.total).toBe(2);
    expect(model.buckets[0].cards.map((c) => c.id)).toEqual(["T-001", "T-009"]);
  });

  it("is empty when nothing is done", () => {
    const model = buildDone(ws([card({ id: "T-001", done: false, section: "backlog" })]));
    expect(model.total).toBe(0);
    expect(model.buckets).toEqual([]);
    expect(model.charters).toEqual([]);
  });
});

describe("doneNote", () => {
  it("speaks to an empty base", () => {
    expect(doneNote(buildDone(ws([])))).toMatch(/Nothing finished yet/);
  });

  it("counts this week", () => {
    const note = doneNote(buildDone(ws([card({ id: "T-001", doneDate: "2026-08-27" })])));
    expect(note).toBe("1 thing finished this week, 1 in all.");
  });

  it("notes a quiet week", () => {
    const note = doneNote(buildDone(ws([card({ id: "T-001", doneDate: "2026-07-01" })])));
    expect(note).toMatch(/none this week/);
  });
});
