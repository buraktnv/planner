import { describe, expect, it } from "vitest";
import { parseTasks, serializeTasks } from "../schema";
import { blockerOf, isBlocked } from "../deps";
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

describe("waits: field in the task grammar", () => {
  it("parses a task id value", () => {
    const raw = [
      "## Backlog",
      "- [ ] T-001 | M | Blocker | created:2026-08-27",
      "- [ ] T-002 | S | Waiter | created:2026-08-27 | waits:T-001",
      "",
      "## In progress",
      "",
      "## Done",
      "",
    ].join("\n");
    const tasks = parseTasks(raw);
    expect(tasks.find((t) => t.id === "T-002")?.waitsOn).toBe("T-001");
    expect(tasks.find((t) => t.id === "T-001")?.waitsOn).toBeUndefined();
  });

  it("parses free text with spaces", () => {
    const raw = [
      "## Backlog",
      "- [ ] T-001 | S | Send the forms | waits:the clinic reception desk",
      "",
    ].join("\n");
    expect(parseTasks(raw)[0].waitsOn).toBe("the clinic reception desk");
  });

  it("tolerates an id that does not exist in the file", () => {
    const raw = ["## Backlog", "- [ ] T-001 | S | Orphan waiter | waits:T-999", ""].join("\n");
    expect(parseTasks(raw)[0].waitsOn).toBe("T-999");
  });

  it("rejects an empty waits value", () => {
    const raw = ["## Backlog", "- [ ] T-001 | S | No value | waits:", ""].join("\n");
    expect(() => parseTasks(raw)).toThrow(/empty waits: value/);
  });

  it("serializes waits after lane and before done", () => {
    const open = serializeTasks([
      task({ created: "2026-08-27", due: "2026-09-01", lane: "some", waitsOn: "the clinic" }),
    ]);
    expect(open).toContain(
      "- [ ] T-001 | M | Something | created:2026-08-27 | due:2026-09-01 | lane:some | waits:the clinic",
    );
    const closed = serializeTasks([
      task({ done: true, section: "done", doneDate: "2026-08-28", waitsOn: "T-004" }),
    ]);
    expect(closed).toContain("- [x] T-001 | M | Something | waits:T-004 | done:2026-08-28");
  });

  it("round-trips a file with id and free-text dependencies", () => {
    const raw = [
      "## Backlog",
      "- [ ] T-001 | L | Gather the papers | created:2026-08-27",
      "  - [ ] T-001.1 | S | Print the copies | created:2026-08-27 | waits:T-001",
      "- [ ] T-002 | S | Send the forms | created:2026-08-27 | lane:some | waits:the clinic",
      "",
      "## In progress",
      "",
      "## Done",
      "",
    ].join("\n");
    const once = serializeTasks(parseTasks(raw));
    expect(once).toBe(raw);
    expect(serializeTasks(parseTasks(once))).toBe(once);
  });
});

describe("blockerOf", () => {
  const blocker = task({ id: "T-001", title: "Gather the papers" });
  const waiter = task({ id: "T-002", waitsOn: "T-001" });
  const freeText = task({ id: "T-003", waitsOn: "the clinic" });

  it("returns the matching task in the same list", () => {
    expect(blockerOf(waiter, [blocker, waiter])?.id).toBe("T-001");
  });

  it("returns null for free text", () => {
    expect(blockerOf(freeText, [blocker, freeText])).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(blockerOf(task({ id: "T-004", waitsOn: "T-999" }), [blocker])).toBeNull();
  });

  it("returns null when nothing is waited on", () => {
    expect(blockerOf(blocker, [blocker])).toBeNull();
  });
});

describe("isBlocked truth table", () => {
  const openBlocker = task({ id: "T-001" });
  const doneBlocker = task({ id: "T-001", done: true, section: "done", doneDate: "2026-08-28" });

  it("is false with no waitsOn", () => {
    expect(isBlocked(task({ id: "T-002" }), [openBlocker])).toBe(false);
  });

  it("is true for free text", () => {
    const t = task({ id: "T-002", waitsOn: "the clinic" });
    expect(isBlocked(t, [openBlocker, t])).toBe(true);
  });

  it("is true for an unknown id", () => {
    const t = task({ id: "T-002", waitsOn: "T-999" });
    expect(isBlocked(t, [openBlocker, t])).toBe(true);
  });

  it("is true when the blocker exists and is open", () => {
    const t = task({ id: "T-002", waitsOn: "T-001" });
    expect(isBlocked(t, [openBlocker, t])).toBe(true);
  });

  it("is false when the blocker is done", () => {
    const t = task({ id: "T-002", waitsOn: "T-001" });
    expect(isBlocked(t, [doneBlocker, t])).toBe(false);
  });
});
