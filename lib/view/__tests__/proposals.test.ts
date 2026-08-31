import { describe, expect, it } from "vitest";
import type { StoredProposal } from "@/lib/core/proposals";
import {
  ageLabel,
  groupProposals,
  isOpen,
  outcomeText,
  pendingCount,
  rowSummary,
  statusLabel,
  toRow,
} from "../proposals";

function stored(over: Partial<StoredProposal> = {}): StoredProposal {
  return {
    id: "p-abc123-def45",
    status: "pending",
    title: "A batch",
    agent: "claude-code",
    created: "2026-08-31 10:00:00",
    actions: [{ kind: "create_task", project: "acme-bot", title: "One", size: "S" }],
    dropped: 0,
    unknown: [],
    ...over,
  };
}

describe("toRow re-validates what came off disk", () => {
  it("keeps actions the schema accepts", () => {
    const row = toRow(stored());
    expect(row.actions).toHaveLength(1);
    expect(row.invalid).toBe(0);
    expect(row.empty).toBe(false);
  });

  /** The file is hand-editable, so apply must never see a refused action. */
  it("counts an action the schema refuses instead of passing it on", () => {
    const row = toRow(
      stored({
        actions: [
          { kind: "create_task", project: "acme-bot", title: "Fine", size: "S" },
          { kind: "create_task", project: "acme-bot" },
          { kind: "not_a_kind", whatever: true },
          "a bare string",
          null,
        ],
      }),
    );
    expect(row.actions).toHaveLength(1);
    expect(row.invalid).toBe(4);
  });

  it("adds the lines that never parsed as JSON at all", () => {
    const row = toRow(stored({ dropped: 2 }));
    expect(row.invalid).toBe(2);
  });

  it("marks a proposal with nothing usable as empty", () => {
    const row = toRow(stored({ actions: [{ kind: "nonsense" }] }));
    expect(row.empty).toBe(true);
  });
});

describe("grouping", () => {
  it("treats pending and applying as still open", () => {
    expect(isOpen("pending")).toBe(true);
    expect(isOpen("applying")).toBe(true);
    expect(isOpen("applied")).toBe(false);
    expect(isOpen("partial")).toBe(false);
    expect(isOpen("discarded")).toBe(false);
  });

  it("puts what needs a decision first", () => {
    const rows = [
      toRow(stored({ id: "p-a1-b1", status: "applied" })),
      toRow(stored({ id: "p-a2-b2", status: "pending" })),
      toRow(stored({ id: "p-a3-b3", status: "discarded" })),
      toRow(stored({ id: "p-a4-b4", status: "applying" })),
    ];
    const groups = groupProposals(rows);
    expect(groups.open.map((r) => r.id)).toEqual(["p-a2-b2", "p-a4-b4"]);
    expect(groups.settled.map((r) => r.id)).toEqual(["p-a1-b1", "p-a3-b3"]);
  });

  /** The chip must not advertise a proposal there is nothing to do with. */
  it("counts only pending proposals that still have actions", () => {
    const rows = [
      toRow(stored({ id: "p-a1-b1" })),
      toRow(stored({ id: "p-a2-b2", status: "applied" })),
      toRow(stored({ id: "p-a3-b3", actions: [{ kind: "nonsense" }] })),
      toRow(stored({ id: "p-a4-b4", status: "applying" })),
    ];
    expect(pendingCount(rows)).toBe(1);
  });
});

describe("rowSummary", () => {
  it("describes a batch by what it would write", () => {
    const row = toRow(
      stored({
        actions: [
          { kind: "create_task", project: "acme-bot", title: "One", size: "S" },
          { kind: "create_task", project: "acme-bot", title: "Two", size: "M" },
          { kind: "add_note", title: "A note", summary: "A claim" },
          { kind: "create_project", name: "Acme", why: "Because", mvp: "Small" },
        ],
      }),
    );
    expect(rowSummary(row)).toBe("2 tasks, 1 note, 1 project");
  });

  it("says so when there is nothing to apply", () => {
    expect(rowSummary(toRow(stored({ actions: [] })))).toBe("nothing to apply");
  });

  it("mentions unreadable rows rather than hiding them", () => {
    const row = toRow(stored({ dropped: 1 }));
    expect(rowSummary(row)).toBe("1 task · 1 unreadable");
    const dead = toRow(stored({ actions: [], dropped: 3 }));
    expect(rowSummary(dead)).toBe("nothing usable · 3 unreadable");
  });
});

describe("statusLabel", () => {
  it("labels every status", () => {
    expect(statusLabel("pending")).toBe("WAITING");
    expect(statusLabel("applied")).toBe("APPLIED");
    expect(statusLabel("partial")).toBe("PART APPLIED");
    expect(statusLabel("discarded")).toBe("DISCARDED");
    expect(statusLabel("applying")).toBe("APPLYING");
  });
});

describe("ageLabel", () => {
  const now = new Date("2026-08-31T12:00:00Z");

  it("reads recent stamps in minutes and hours", () => {
    expect(ageLabel("2026-08-31 11:59:40", now)).toBe("just now");
    expect(ageLabel("2026-08-31 11:30:00", now)).toBe("30m ago");
    expect(ageLabel("2026-08-31 09:00:00", now)).toBe("3h ago");
  });

  it("reads older stamps in days", () => {
    expect(ageLabel("2026-08-30 12:00:00", now)).toBe("yesterday");
    expect(ageLabel("2026-08-27 12:00:00", now)).toBe("4d ago");
  });

  /** A hand-edited stamp must not render as "NaN days ago". */
  it("says nothing rather than nonsense for a stamp it cannot read", () => {
    expect(ageLabel("", now)).toBe("");
    expect(ageLabel("last Tuesday", now)).toBe("");
  });

  it("does not render a future stamp as negative", () => {
    expect(ageLabel("2026-09-01 12:00:00", now)).toBe("just now");
  });
});

describe("outcomeText", () => {
  it("reports a clean apply", () => {
    expect(outcomeText(3, 3, null)).toBe("3 of 3 applied");
  });

  /** Rows are 1-indexed for a human reading the journal. */
  it("names the row it stopped at", () => {
    expect(outcomeText(2, 5, 2)).toBe("2 of 5 applied, stopped at row 3");
  });
});
