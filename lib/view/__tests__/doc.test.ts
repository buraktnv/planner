import { describe, expect, it } from "vitest";
import {
  buildDocPage,
  docHref,
  linkifyNoteRefs,
  noteRefsIn,
  slugifyHeading,
  tocOf,
} from "../doc";
import type { KnowledgeNote } from "@/lib/core/types";

function note(over: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return {
    id: "K-001",
    title: "A note",
    summary: "A summary.",
    scope: ["gamma"],
    tags: ["architecture"],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "",
    ...over,
  };
}

describe("slugifyHeading", () => {
  it("lowercases and dashes", () => {
    expect(slugifyHeading("The One Rule")).toBe("the-one-rule");
  });

  it("strips backticks and punctuation", () => {
    expect(slugifyHeading("Using `lib/core`, properly!")).toBe("using-lib-core-properly");
  });

  it("never returns an empty id", () => {
    expect(slugifyHeading("!!!")).toBe("section");
  });
});

describe("tocOf", () => {
  it("collects h2 and h3 with depth", () => {
    const toc = tocOf("## One\ntext\n### Under\n## Two");
    expect(toc).toEqual([
      { id: "one", text: "One", depth: 2 },
      { id: "under", text: "Under", depth: 3 },
      { id: "two", text: "Two", depth: 2 },
    ]);
  });

  it("ignores h1 and h4", () => {
    expect(tocOf("# Title\n#### Small").map((t) => t.text)).toEqual([]);
  });

  it("ignores headings inside fenced code", () => {
    const body = "## Real\n\n```bash\n## not a heading\n```\n\n## Also real";
    expect(tocOf(body).map((t) => t.text)).toEqual(["Real", "Also real"]);
  });

  it("handles an unclosed fence without swallowing earlier headings", () => {
    expect(tocOf("## Before\n```\n## inside").map((t) => t.text)).toEqual(["Before"]);
  });

  it("numbers duplicate headings so anchors stay unique", () => {
    expect(tocOf("## Notes\n## Notes\n## Notes").map((t) => t.id)).toEqual([
      "notes",
      "notes-2",
      "notes-3",
    ]);
  });
});

describe("noteRefsIn", () => {
  it("finds refs once each, in order", () => {
    expect(noteRefsIn("see [[K-009]] and [[K-002]] and [[K-009]] again")).toEqual([
      "K-009",
      "K-002",
    ]);
  });

  it("ignores refs inside fenced code", () => {
    expect(noteRefsIn("```\n[[K-009]]\n```")).toEqual([]);
  });
});

describe("linkifyNoteRefs", () => {
  const titles = new Map([["K-009", "Why we left the grid"]]);

  it("turns a known ref into a markdown link", () => {
    expect(linkifyNoteRefs("see [[K-009]]", titles)).toBe(
      "see [Why we left the grid](/knowledge/K-009)",
    );
  });

  it("leaves an unknown ref exactly as written", () => {
    expect(linkifyNoteRefs("see [[K-404]]", titles)).toBe("see [[K-404]]");
  });

  it("does not rewrite refs inside fenced code", () => {
    const body = "```\n[[K-009]]\n```";
    expect(linkifyNoteRefs(body, titles)).toBe(body);
  });
});

describe("docHref", () => {
  it("routes by scope kind", () => {
    expect(docHref("K-001", null)).toBe("/knowledge/K-001");
    expect(docHref("K-001", "gamma")).toBe("/projects/gamma/docs/K-001");
    expect(docHref("K-001", "area:health")).toBe("/areas/health/docs/K-001");
  });
});

describe("buildDocPage", () => {
  const notes = [
    note({ id: "K-001", title: "First", tags: ["architecture"], body: "## A\n## B\n## C" }),
    // Same group: newest updated sorts first, so K-002 precedes K-003.
    note({
      id: "K-002",
      title: "Second",
      tags: ["protocol"],
      updated: "2026-08-03",
      body: "links to [[K-001]]",
    }),
    note({ id: "K-003", title: "Third", tags: ["protocol"], updated: "2026-08-02" }),
    note({ id: "K-004", title: "Elsewhere", scope: ["delta"] }),
  ];

  it("returns null for an unknown id", () => {
    expect(buildDocPage(notes, "K-999", "gamma", "Gamma")).toBeNull();
  });

  it("builds a toc from the body", () => {
    const m = buildDocPage(notes, "K-001", "gamma", "Gamma")!;
    expect(m.toc.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("resolves backlinks and outgoing links to titles", () => {
    const target = buildDocPage(notes, "K-001", "gamma", "Gamma")!;
    expect(target.backlinks).toEqual([
      { id: "K-002", title: "Second", href: "/projects/gamma/docs/K-002" },
    ]);
    const source = buildDocPage(notes, "K-002", "gamma", "Gamma")!;
    expect(source.links).toEqual([
      { id: "K-001", title: "First", href: "/projects/gamma/docs/K-001" },
    ]);
    expect(source.body).toContain("[First](/knowledge/K-001)");
  });

  it("walks prev and next across the scope in group order", () => {
    const first = buildDocPage(notes, "K-001", "gamma", "Gamma")!;
    expect(first.prev).toBeNull();
    expect(first.next?.id).toBe("K-002");

    const last = buildDocPage(notes, "K-003", "gamma", "Gamma")!;
    expect(last.prev?.id).toBe("K-002");
    expect(last.next).toBeNull();
  });

  it("excludes out-of-scope notes from the sidebar groups", () => {
    const m = buildDocPage(notes, "K-001", "gamma", "Gamma")!;
    const ids = m.groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).not.toContain("K-004");
    expect(ids).toEqual(["K-001", "K-002", "K-003"]);
  });

  it("has no groups or neighbours when unscoped", () => {
    const m = buildDocPage(notes, "K-001")!;
    expect(m.groups).toEqual([]);
    expect(m.prev).toBeNull();
    expect(m.next).toBeNull();
    expect(m.backlinks[0].href).toBe("/knowledge/K-002");
  });
});
