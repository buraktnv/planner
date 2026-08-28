import { describe, expect, it } from "vitest";
import { parseTasks, serializeTasks } from "../schema";
import { laneOf, isLane, LANE_ORDER } from "../lanes";
import type { Task } from "../types";

function task(partial: Partial<Task>): Task {
  return {
    id: "T-001",
    title: "Something",
    size: "M",
    done: false,
    section: "backlog",
    parentId: null,
    ...partial,
  };
}

describe("lane field in the task grammar", () => {
  it("parses an explicit lane", () => {
    const raw = [
      "## Backlog",
      "- [ ] T-001 | S | Rename the config keys | created:2026-08-27 | lane:wait",
      "",
      "## In progress",
      "",
      "## Done",
      "",
    ].join("\n");
    const tasks = parseTasks(raw);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].lane).toBe("wait");
  });

  it("leaves lane undefined when the field is absent", () => {
    const raw = ["## Backlog", "- [ ] T-001 | M | No lane here | created:2026-08-27", ""].join("\n");
    expect(parseTasks(raw)[0].lane).toBeUndefined();
  });

  it("rejects an unknown lane value", () => {
    const raw = ["## Backlog", "- [ ] T-001 | M | Bad lane | lane:urgent", ""].join("\n");
    expect(() => parseTasks(raw)).toThrow(/invalid lane "urgent"/);
  });

  it("round-trips every lane value", () => {
    for (const lane of LANE_ORDER) {
      const raw = serializeTasks([task({ lane, created: "2026-08-27" })]);
      const back = parseTasks(raw);
      expect(back[0].lane).toBe(lane);
      expect(serializeTasks(back)).toBe(raw);
    }
  });

  it("serializes lane after due and before done", () => {
    const raw = serializeTasks([
      task({ due: "2026-09-01", lane: "deep", created: "2026-08-27" }),
    ]);
    expect(raw).toContain("- [ ] T-001 | M | Something | created:2026-08-27 | due:2026-09-01 | lane:deep");
  });
});

describe("laneOf", () => {
  it("prefers the explicit lane", () => {
    expect(laneOf(task({ lane: "some", size: "S" }))).toBe("some");
  });

  it("derives quick for small open tasks", () => {
    expect(laneOf(task({ size: "S" }))).toBe("quick");
  });

  it("derives deep for medium and large open tasks", () => {
    expect(laneOf(task({ size: "M" }))).toBe("deep");
    expect(laneOf(task({ size: "L" }))).toBe("deep");
  });

  it("derives quick for finished tasks regardless of size", () => {
    expect(laneOf(task({ size: "L", done: true, section: "done" }))).toBe("quick");
  });
});

describe("isLane", () => {
  it("accepts known lanes and rejects anything else", () => {
    expect(isLane("quick")).toBe(true);
    expect(isLane("some")).toBe(true);
    expect(isLane("nope")).toBe(false);
    expect(isLane(3)).toBe(false);
    expect(isLane(undefined)).toBe(false);
  });
});

describe("subtasks split across sections", () => {
  it("reads a done subtask whose parent is still in backlog", () => {
    const raw = [
      "## Backlog",
      "- [ ] T-001 | L | Audit the recovery plans | created:2026-08-27",
      "  - [ ] T-001.1 | M | Read the first two | created:2026-08-27",
      "",
      "## In progress",
      "",
      "## Done",
      "  - [x] T-001.3 | S | Write the fix list | done:2026-08-28",
      "",
    ].join("\n");
    const tasks = parseTasks(raw);
    const sub = tasks.find((t) => t.id === "T-001.3");
    expect(sub?.parentId).toBe("T-001");
    expect(sub?.section).toBe("done");
    expect(tasks.find((t) => t.id === "T-001")?.section).toBe("backlog");
  });

  it("reads an open subtask whose parent is already done", () => {
    const raw = [
      "## Backlog",
      "  - [ ] T-004.1 | S | Still open | created:2026-08-27",
      "",
      "## In progress",
      "",
      "## Done",
      "- [x] T-004 | M | Parent finished first | done:2026-08-28",
      "",
    ].join("\n");
    const tasks = parseTasks(raw);
    expect(tasks.find((t) => t.id === "T-004.1")?.parentId).toBe("T-004");
  });

  it("still rejects a subtask whose parent is nowhere in the file", () => {
    const raw = ["## Backlog", "  - [ ] T-007.1 | S | Orphan | created:2026-08-27", ""].join("\n");
    expect(() => parseTasks(raw)).toThrow(/no parent "T-007"/);
  });

  it("still rejects an indent that does not match the id depth", () => {
    const raw = ["## Backlog", "    - [ ] T-009 | S | Deep | created:2026-08-27", ""].join("\n");
    expect(() => parseTasks(raw)).toThrow(/no parent at depth/);
  });

  it("round-trips a file with subtasks split across sections", () => {
    const raw = [
      "## Backlog",
      "- [ ] T-001 | L | Audit the recovery plans | created:2026-08-27",
      "  - [ ] T-001.1 | M | Read the first two | created:2026-08-27",
      "",
      "## In progress",
      "",
      "## Done",
      "  - [x] T-001.3 | S | Write the fix list | done:2026-08-28",
      "",
    ].join("\n");
    expect(serializeTasks(parseTasks(raw))).toBe(raw);
  });
});
