import { describe, expect, it } from "vitest";
import { linkifyTaskRefs, taskRefsIn } from "../task-refs";

const href = (id: string) => `/projects/demo/tasks/${id}`;

describe("taskRefsIn", () => {
  it("finds ids in prose, including dotted subtask ids", () => {
    expect(taskRefsIn("Blocked by T-003 until T-007.2 lands.")).toEqual(["T-003", "T-007.2"]);
  });

  it("lists each id once, in document order", () => {
    expect(taskRefsIn("T-009 then T-002, and T-009 again")).toEqual(["T-009", "T-002"]);
  });

  it("ignores ids inside a fenced code block", () => {
    const body = "See T-001.\n\n```\n- [ ] T-042 | M | A sample line\n```\n\nAnd T-002.";
    expect(taskRefsIn(body)).toEqual(["T-001", "T-002"]);
  });

  it("ignores ids inside inline code", () => {
    expect(taskRefsIn("The id `T-042` is a sample; T-001 is real.")).toEqual(["T-001"]);
  });

  it("ignores an id already inside a markdown link", () => {
    expect(taskRefsIn("[T-042](/somewhere) but T-001 is loose")).toEqual(["T-001"]);
  });

  it("does not match a fragment of a longer token", () => {
    expect(taskRefsIn("ART-003 and T-003x and TT-003")).toEqual([]);
  });

  it("handles a tilde fence too", () => {
    expect(taskRefsIn("~~~\nT-042\n~~~\nT-001")).toEqual(["T-001"]);
  });
});

describe("linkifyTaskRefs", () => {
  it("links a known id", () => {
    expect(linkifyTaskRefs("Blocked by T-003.", href)).toBe(
      "Blocked by [T-003](/projects/demo/tasks/T-003).",
    );
  });

  it("leaves an id with no href exactly as written", () => {
    expect(linkifyTaskRefs("Blocked by T-003.", () => null)).toBe("Blocked by T-003.");
  });

  it("links only the ids that resolve", () => {
    const only001 = (id: string) => (id === "T-001" ? href(id) : null);
    expect(linkifyTaskRefs("T-001 and T-002", only001)).toBe(
      "[T-001](/projects/demo/tasks/T-001) and T-002",
    );
  });

  it("leaves fenced code byte-identical", () => {
    const body = "```\n- [ ] T-001 | M | Sample | lane:deep\n```";
    expect(linkifyTaskRefs(body, href)).toBe(body);
  });

  it("leaves inline code and existing links untouched while linking around them", () => {
    expect(linkifyTaskRefs("`T-001` vs [T-002](/x) vs T-003", href)).toBe(
      "`T-001` vs [T-002](/x) vs [T-003](/projects/demo/tasks/T-003)",
    );
  });

  it("is idempotent — a second pass does not nest links", () => {
    const once = linkifyTaskRefs("Blocked by T-003.", href);
    expect(linkifyTaskRefs(once, href)).toBe(once);
  });

  it("links every mention on a line, not just the first", () => {
    expect(linkifyTaskRefs("T-001 then T-002", href)).toBe(
      "[T-001](/projects/demo/tasks/T-001) then [T-002](/projects/demo/tasks/T-002)",
    );
  });

  it("survives an unclosed fence by treating the rest as code", () => {
    expect(linkifyTaskRefs("```\nT-001", href)).toBe("```\nT-001");
  });
});
