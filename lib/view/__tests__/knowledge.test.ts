import { describe, expect, it } from "vitest";
import { buildKnowledge, knowledgeNote, scopeChip, slugOfScope } from "../knowledge";
import type { KnowledgeNote } from "@/lib/core/types";

function note(over: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return {
    id: "K-001",
    title: "A note",
    summary: "A summary.",
    scope: [],
    tags: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "",
    ...over,
  };
}

describe("slugOfScope", () => {
  it("strips the area prefix", () => {
    expect(slugOfScope("area:research")).toBe("research");
    expect(slugOfScope("acme-app")).toBe("acme-app");
  });
});

describe("scopeChip", () => {
  it("labels by slug and flags areas", () => {
    const chip = scopeChip("area:research");
    expect(chip.label).toBe("research");
    expect(chip.isArea).toBe(true);
    expect(chip.color).toMatch(/^#|^hsl/);
  });

  it("prefers a supplied display name", () => {
    expect(scopeChip("area:research", { "area:research": "Research" }).label).toBe("Research");
    expect(scopeChip("acme-app", { "area:research": "Research" }).label).toBe("acme-app");
  });

  it("gives the same colour to a project and its area form", () => {
    expect(scopeChip("research").color).toBe(scopeChip("area:research").color);
  });
});

describe("buildKnowledge", () => {
  it("is empty for no notes", () => {
    const m = buildKnowledge([]);
    expect(m.total).toBe(0);
    expect(m.rows).toEqual([]);
    expect(m.scopes).toEqual([]);
    expect(m.tags).toEqual([]);
    expect(m.scopeless).toBe(0);
  });

  it("sorts rows newest first, breaking ties by id descending", () => {
    const m = buildKnowledge([
      note({ id: "K-001", updated: "2026-08-01" }),
      note({ id: "K-002", updated: "2026-08-09" }),
      note({ id: "K-003", updated: "2026-08-09" }),
    ]);
    expect(m.rows.map((r) => r.id)).toEqual(["K-003", "K-002", "K-001"]);
  });

  it("counts scope facets and orders them by count", () => {
    const m = buildKnowledge([
      note({ id: "K-001", scope: ["acme-app"] }),
      note({ id: "K-002", scope: ["acme-app", "area:daily"] }),
      note({ id: "K-003", scope: ["acme-app"] }),
    ]);
    expect(m.scopes.map((s) => [s.key, s.count])).toEqual([
      ["acme-app", 3],
      ["area:daily", 1],
    ]);
  });

  it("counts tag facets and orders them by count then name", () => {
    const m = buildKnowledge([
      note({ id: "K-001", tags: ["zeta", "alpha"] }),
      note({ id: "K-002", tags: ["alpha"] }),
      note({ id: "K-003", tags: ["beta"] }),
    ]);
    expect(m.tags.map((t) => [t.tag, t.count])).toEqual([
      ["alpha", 2],
      ["beta", 1],
      ["zeta", 1],
    ]);
  });

  it("counts scopeless notes", () => {
    const m = buildKnowledge([
      note({ id: "K-001" }),
      note({ id: "K-002", scope: ["acme-app"] }),
      note({ id: "K-003" }),
    ]);
    expect(m.scopeless).toBe(2);
  });

  it("carries display names onto row chips", () => {
    const m = buildKnowledge([note({ scope: ["acme-app"] })], { "acme-app": "Acme App" });
    expect(m.rows[0].scope[0].label).toBe("Acme App");
  });
});

describe("knowledgeNote", () => {
  it("nudges when the base is empty", () => {
    expect(knowledgeNote(buildKnowledge([]))).toMatch(/Nothing filed yet/);
  });

  it("calls out scopeless notes", () => {
    const text = knowledgeNote(buildKnowledge([note({ scope: [] })]));
    expect(text).toMatch(/1 has no scope/);
    expect(text).toMatch(/never loaded automatically/);
  });

  it("summarises scopes when everything is filed", () => {
    const text = knowledgeNote(
      buildKnowledge([
        note({ id: "K-001", scope: ["acme-app"] }),
        note({ id: "K-002", scope: ["area:daily"] }),
      ]),
    );
    expect(text).toBe(
      "2 notes filed across 2 scopes. Only the focused scope is loaded into chat.",
    );
  });
});
