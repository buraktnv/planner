import { describe, expect, it } from "vitest";
import {
  applyCanvasFilter,
  bandKeyOf,
  canvasFacets,
  charterMap,
  compareBands,
  filterHref,
  filterQuery,
  isFiltered,
  labelOf,
  NO_FILTER,
  parseCanvasFilter,
  statusOf,
  toggleStatus,
  UNFILED,
  withTag,
  withTopic,
  type BandCharter,
} from "../canvas-filter";
import type { KnowledgeNote } from "@/lib/core/types";

function note(over: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return {
    id: "K-001",
    title: "T",
    summary: "S",
    scope: [],
    tags: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "",
    ...over,
  };
}

const BANDS: BandCharter[] = [
  { key: "acme-app", name: "Acme App", status: "active" },
  { key: "acme-bot", name: "Acme Bot", status: "paused" },
  { key: "area:acme-health", name: "Acme Health", status: "active" },
  { key: "acme-old", name: "Acme Old", status: "done" },
];
const CHARTERS = charterMap(BANDS);

describe("band identity", () => {
  it("takes the first scope, and treats a scopeless note as unfiled", () => {
    expect(bandKeyOf(note({ scope: ["acme-app", "acme-bot"] }))).toBe("acme-app");
    expect(bandKeyOf(note())).toBeNull();
  });

  it("gives an unfiled note and an unknown scope the same non-status", () => {
    expect(statusOf(null, CHARTERS)).toBe("none");
    expect(statusOf("acme-vanished", CHARTERS)).toBe("none");
    expect(statusOf("acme-app", CHARTERS)).toBe("active");
  });

  it("labels an unknown area key by its slug rather than showing the prefix", () => {
    expect(labelOf("area:acme-health", CHARTERS)).toBe("Acme Health");
    expect(labelOf("area:acme-gone", CHARTERS)).toBe("acme-gone");
    expect(labelOf(null, CHARTERS)).toBe("Unfiled");
  });
});

describe("compareBands", () => {
  it("puts active before paused, paused before done, unfiled last", () => {
    const keys = ["acme-old", null, "acme-bot", "acme-app"];
    expect([...keys].sort((a, b) => compareBands(a, b, CHARTERS))).toEqual([
      "acme-app",
      "acme-bot",
      "acme-old",
      null,
    ]);
  });

  it("breaks a tie on the label, so two active charters keep a stable order", () => {
    // Both active: Acme App before Acme Health on name, not on note id.
    expect(compareBands("area:acme-health", "acme-app", CHARTERS)).toBeGreaterThan(0);
    expect(compareBands("acme-app", "area:acme-health", CHARTERS)).toBeLessThan(0);
  });

  it("sorts an unknown scope among the unfiled, by label, and is reflexive", () => {
    // A scope naming no live charter has no status, so it shares the last rank
    // with the truly unfiled and is then ordered by label.
    expect(compareBands("acme-gone", null, CHARTERS)).toBeLessThan(0);
    expect(compareBands(null, "acme-gone", CHARTERS)).toBeGreaterThan(0);
    expect(compareBands("acme-gone", "acme-app", CHARTERS)).toBeGreaterThan(0);
    expect(compareBands("acme-gone", "acme-gone", CHARTERS)).toBe(0);
    expect(compareBands(null, null, CHARTERS)).toBe(0);
  });
});

describe("parseCanvasFilter", () => {
  it("reads nothing as no filter", () => {
    expect(parseCanvasFilter(undefined)).toEqual(NO_FILTER);
    expect(parseCanvasFilter({})).toEqual(NO_FILTER);
  });

  it("accepts a comma list and a repeated key, and dedupes", () => {
    expect(parseCanvasFilter({ status: "active,paused" }).status).toEqual(["active", "paused"]);
    expect(parseCanvasFilter({ status: ["paused", "active", "paused"] }).status).toEqual([
      "active",
      "paused",
    ]);
  });

  it("drops a status that is not one, rather than throwing or passing it on", () => {
    expect(parseCanvasFilter({ status: "active,wishful,,done" }).status).toEqual([
      "active",
      "done",
    ]);
    expect(parseCanvasFilter({ status: "wishful" }).status).toEqual([]);
  });

  it("keeps status in rank order however it arrived", () => {
    expect(parseCanvasFilter({ status: "none,done,active" }).status).toEqual([
      "active",
      "done",
      "none",
    ]);
  });

  it("treats blank and whitespace topic or tag as absent", () => {
    const f = parseCanvasFilter({ topic: "   ", tag: "" });
    expect(f.topic).toBeNull();
    expect(f.tag).toBeNull();
  });

  it("takes the first value when a single-valued key repeats", () => {
    expect(parseCanvasFilter({ topic: ["acme-app", "acme-bot"] }).topic).toBe("acme-app");
  });
});

describe("filterQuery", () => {
  it("is empty when nothing is set, so an unfiltered board has a clean URL", () => {
    expect(filterQuery(NO_FILTER)).toBe("");
    expect(filterHref("/canvas", NO_FILTER)).toBe("/canvas");
  });

  it("round-trips through parseCanvasFilter", () => {
    const f = { status: ["active", "done"] as const, topic: "area:acme-health", tag: "decision" };
    const q = filterQuery({ ...f, status: [...f.status] });
    const parsed = parseCanvasFilter(
      Object.fromEntries(new URLSearchParams(q.slice(1)).entries()),
    );
    expect(parsed).toEqual({ status: ["active", "done"], topic: "area:acme-health", tag: "decision" });
  });

  it("writes the same URL for the same filter regardless of how it was built", () => {
    const a = withTag(withTopic(toggleStatus(NO_FILTER, "active"), "acme-app"), "runbook");
    const b = toggleStatus(withTag(withTopic(NO_FILTER, "acme-app"), "runbook"), "active");
    expect(filterQuery(a)).toBe(filterQuery(b));
  });
});

describe("toggleStatus", () => {
  it("adds then removes, and keeps rank order", () => {
    const one = toggleStatus(NO_FILTER, "done");
    expect(one.status).toEqual(["done"]);
    const two = toggleStatus(one, "active");
    expect(two.status).toEqual(["active", "done"]);
    expect(toggleStatus(two, "done").status).toEqual(["active"]);
  });

  it("leaves the other fields alone", () => {
    const f = withTopic(NO_FILTER, "acme-app");
    expect(toggleStatus(f, "active").topic).toBe("acme-app");
  });
});

describe("isFiltered", () => {
  it("is false only when nothing at all is set", () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered(toggleStatus(NO_FILTER, "active"))).toBe(true);
    expect(isFiltered(withTopic(NO_FILTER, UNFILED))).toBe(true);
    expect(isFiltered(withTag(NO_FILTER, "decision"))).toBe(true);
  });
});

const NOTES: KnowledgeNote[] = [
  note({ id: "K-001", scope: ["acme-old"], tags: ["decision"] }),
  note({ id: "K-002", scope: ["acme-bot"], tags: ["runbook"] }),
  note({ id: "K-003", scope: ["acme-app"], tags: ["decision", "architecture"] }),
  note({ id: "K-004", scope: [], tags: ["reference"] }),
  note({ id: "K-005", scope: ["area:acme-health"], tags: [] }),
  note({ id: "K-006", scope: ["acme-app"], tags: [] }),
];

describe("applyCanvasFilter", () => {
  it("orders by status band, then by id inside a band", () => {
    expect(applyCanvasFilter(NOTES, CHARTERS, NO_FILTER).map((n) => n.id)).toEqual([
      "K-003",
      "K-006",
      "K-005",
      "K-002",
      "K-001",
      "K-004",
    ]);
  });

  it("hides nothing when no filter is set", () => {
    expect(applyCanvasFilter(NOTES, CHARTERS, NO_FILTER)).toHaveLength(NOTES.length);
  });

  it("filters by status, counting an unfiled note as none", () => {
    expect(
      applyCanvasFilter(NOTES, CHARTERS, toggleStatus(NO_FILTER, "active")).map((n) => n.id),
    ).toEqual(["K-003", "K-006", "K-005"]);
    expect(
      applyCanvasFilter(NOTES, CHARTERS, toggleStatus(NO_FILTER, "none")).map((n) => n.id),
    ).toEqual(["K-004"]);
  });

  it("filters by topic, and by the unfiled sentinel", () => {
    expect(
      applyCanvasFilter(NOTES, CHARTERS, withTopic(NO_FILTER, "acme-app")).map((n) => n.id),
    ).toEqual(["K-003", "K-006"]);
    expect(
      applyCanvasFilter(NOTES, CHARTERS, withTopic(NO_FILTER, UNFILED)).map((n) => n.id),
    ).toEqual(["K-004"]);
  });

  it("filters by tag", () => {
    expect(
      applyCanvasFilter(NOTES, CHARTERS, withTag(NO_FILTER, "decision")).map((n) => n.id),
    ).toEqual(["K-003", "K-001"]);
  });

  it("ands the three filters together", () => {
    const f = withTag(toggleStatus(NO_FILTER, "active"), "decision");
    expect(applyCanvasFilter(NOTES, CHARTERS, f).map((n) => n.id)).toEqual(["K-003"]);
  });

  it("returns nothing rather than everything when a topic matches no note", () => {
    expect(applyCanvasFilter(NOTES, CHARTERS, withTopic(NO_FILTER, "acme-nope"))).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...NOTES];
    applyCanvasFilter(input, CHARTERS, NO_FILTER);
    expect(input.map((n) => n.id)).toEqual(NOTES.map((n) => n.id));
  });
});

describe("canvasFacets", () => {
  it("counts statuses over the whole base and drops the empty ones", () => {
    const f = canvasFacets(NOTES, CHARTERS);
    expect(f.statuses).toEqual([
      { value: "active", label: "active", count: 3 },
      { value: "paused", label: "paused", count: 1 },
      { value: "done", label: "done", count: 1 },
      { value: "none", label: "unfiled", count: 1 },
    ]);
  });

  it("keeps counts on the whole base while a filter is active, so there is a way back", () => {
    const f = canvasFacets(NOTES, CHARTERS, withTopic(NO_FILTER, "acme-app"));
    expect(f.statuses.find((s) => s.value === "done")?.count).toBe(1);
    expect(f.shown).toBe(2);
    expect(f.total).toBe(6);
  });

  it("offers a live charter with no notes as a topic, at zero", () => {
    const empty = canvasFacets([], CHARTERS);
    expect(empty.topics.map((t) => t.value)).toEqual([
      "acme-app",
      "area:acme-health",
      "acme-bot",
      "acme-old",
    ]);
    expect(empty.topics.every((t) => t.count === 0)).toBe(true);
  });

  it("orders topics by status like the bands, with unfiled last", () => {
    const f = canvasFacets(NOTES, CHARTERS);
    expect(f.topics.map((t) => t.value)).toEqual([
      "acme-app",
      "area:acme-health",
      "acme-bot",
      "acme-old",
      UNFILED,
    ]);
  });

  it("counts a tag once per note however many times it is listed", () => {
    const dupes = [note({ id: "K-010", tags: ["decision", "decision"] })];
    expect(canvasFacets(dupes, CHARTERS).tags).toEqual([
      { value: "decision", label: "decision", count: 1 },
    ]);
  });

  it("ranks tags by count, then alphabetically", () => {
    const f = canvasFacets(NOTES, CHARTERS);
    expect(f.tags.map((t) => t.value)).toEqual([
      "decision",
      "architecture",
      "reference",
      "runbook",
    ]);
  });

  it("reports an empty base without throwing", () => {
    const f = canvasFacets([], charterMap([]));
    expect(f).toMatchObject({ statuses: [], topics: [], tags: [], shown: 0, total: 0 });
  });
});
