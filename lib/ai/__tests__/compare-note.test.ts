import { describe, expect, it } from "vitest";
import { comparePrompt, compareSchema, compareToActions } from "../compare-note";
import { proposalActionSchema } from "../schemas";

const current = { id: "K-007", summary: "Fixed spacing cannot survive a breakout.", forAi: "Grid is dead." };

describe("compareToActions", () => {
  it("returns null when the model proposes nothing new", () => {
    expect(compareToActions({ summaryStillTrue: true, verdict: "Fine.", summary: "", forAi: "" }, current)).toBeNull();
    expect(
      compareToActions(
        { summaryStillTrue: true, verdict: "Fine.", summary: current.summary, forAi: " Grid is dead. " },
        current,
      ),
    ).toBeNull();
  });

  it("carries only the fields that changed, and confirms a section it left alone", () => {
    const action = compareToActions(
      { summaryStillTrue: false, verdict: "Off.", summary: "Grids die on trends.", forAi: "" },
      current,
    );
    expect(action).toEqual({
      kind: "update_note",
      id: "K-007",
      summary: "Grids die on trends.",
      confirmAi: true,
    });
    const noSection = compareToActions(
      { summaryStillTrue: false, verdict: "Off.", summary: "Grids die on trends.", forAi: "" },
      { ...current, forAi: null },
    );
    expect(noSection).toEqual({ kind: "update_note", id: "K-007", summary: "Grids die on trends." });
    const both = compareToActions(
      { summaryStillTrue: false, verdict: "Off.", summary: "Grids die on trends.", forAi: "Never propose a grid." },
      current,
    );
    expect(both).toEqual({
      kind: "update_note",
      id: "K-007",
      summary: "Grids die on trends.",
      forAi: "Never propose a grid.",
    });
    expect(proposalActionSchema.safeParse(both).success).toBe(true);
  });

  it("drops a summary the writer would refuse rather than failing at Accept", () => {
    expect(
      compareToActions({ summaryStillTrue: true, verdict: "", summary: "Two\nlines", forAi: "" }, current),
    ).toBeNull();
    expect(
      compareToActions({ summaryStillTrue: true, verdict: "", summary: "a | b", forAi: "New." }, current),
    ).toEqual({ kind: "update_note", id: "K-007", forAi: "New." });
    expect(
      compareToActions({ summaryStillTrue: true, verdict: "", summary: "Two\nlines", forAi: "" }, current),
    ).toBeNull();
  });

  it("works for a note with no section yet", () => {
    const action = compareToActions(
      { summaryStillTrue: true, verdict: "", summary: "", forAi: "First facts." },
      { ...current, forAi: null },
    );
    expect(action).toMatchObject({ forAi: "First facts." });
  });
});

describe("compareSchema", () => {
  it("fills every field so a sparse answer still parses", () => {
    expect(compareSchema.parse({})).toEqual({ summaryStillTrue: true, verdict: "", summary: "", forAi: "" });
  });
});

describe("comparePrompt", () => {
  it("shows all three texts and asks for the JSON shape", () => {
    const p = comparePrompt({ id: "K-007", title: "Grid", summary: "S.", human: "Body.", forAi: null });
    expect(p).toContain("SUMMARY");
    expect(p).toContain("Body.");
    expect(p).toContain("(nothing written yet)");
    expect(p).toContain('"summaryStillTrue"');
  });
});
