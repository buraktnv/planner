import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { parseTasks, serializeTasks, nextTaskId, TaskParseError } from "../schema";

const RAW = `## Backlog
- [ ] T-002 | M | Build chart | created:2026-08-27 | est:2h
- [ ] T-003 | L | Big thing | created:2026-08-27
  - [ ] T-003.1 | S | Part one | created:2026-08-27

## In progress
- [ ] T-001 | S | Started task | created:2026-08-26 | due:2026-09-01

## Done
- [x] T-000 | S | Old task | done:2026-08-25
`;

const toLF = (s: string) => s.replace(/\r\n/g, "\n");

describe("parseTasks", () => {
  it("parses all sections into section values", () => {
    const tasks = parseTasks(RAW);
    expect(tasks.map((t) => t.section)).toEqual([
      "backlog",
      "backlog",
      "backlog",
      "in-progress",
      "done",
    ]);
  });

  it("captures fields", () => {
    const tasks = parseTasks(RAW);
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    expect(byId["T-002"]).toMatchObject({ size: "M", title: "Build chart", created: "2026-08-27", est: "2h", done: false });
    expect(byId["T-001"]).toMatchObject({ size: "S", due: "2026-09-01", section: "in-progress" });
    expect(byId["T-000"]).toMatchObject({ done: true, doneDate: "2026-08-25", section: "done" });
  });

  it("assigns parentId to subtasks", () => {
    const tasks = parseTasks(RAW);
    const sub = tasks.find((t) => t.id === "T-003.1");
    expect(sub?.parentId).toBe("T-003");
  });

  it("round-trips identically", () => {
    expect(serializeTasks(parseTasks(RAW))).toBe(toLF(RAW));
  });

  it("rejects line with missing size", () => {
    const bad = RAW.replace("T-002 | M | ", "T-002 | ");
    expect(() => parseTasks(bad)).toThrow(/T-002.*size/i);
  });

  it("rejects bad size letter", () => {
    const bad = RAW.replace("T-002 | M |", "T-002 | X |");
    expect(() => parseTasks(bad)).toThrow(/T-002.*size/i);
  });

  it("rejects missing id", () => {
    const bad = `## Backlog
- [ ]  | M | No id | created:2026-08-27
`;
    expect(() => parseTasks(bad)).toThrow(/id/i);
  });

  it("rejects unknown field key", () => {
    const bad = RAW.replace("est:2h", "wiggle:2h");
    expect(() => parseTasks(bad)).toThrow(/field key/i);
  });

  it("rejects odd indent spaces", () => {
    const bad = RAW.replace("  - [ ] T-003.1", "   - [ ] T-003.1");
    expect(() => parseTasks(bad)).toThrow(/odd|indent/i);
  });

  it("rejects depth jump greater than 1", () => {
    const bad = `## Backlog
    - [ ] T-009 | S | Deep | created:2026-08-27
`;
    expect(() => parseTasks(bad)).toThrow(/jump|parent/i);
  });

  it("rejects task line before any section", () => {
    const bad = `- [ ] T-005 | S | Early | created:2026-08-27

## Backlog
- [ ] T-006 | S | Ok | created:2026-08-27
`;
    expect(() => parseTasks(bad)).toThrow(/section/i);
  });

  it("rejects out-of-order sections", () => {
    const bad = `## Backlog
- [ ] T-001 | S | A | created:2026-08-27

## Done
- [x] T-002 | S | B | done:2026-08-25

## Backlog
- [ ] T-003 | S | C | created:2026-08-27
`;
    expect(() => parseTasks(bad)).toThrow(/order|section/i);
  });

  it("rejects duplicate id", () => {
    const bad = `## Backlog
- [ ] T-002 | M | Build chart | created:2026-08-27
- [ ] T-002 | S | Dup | created:2026-08-27
`;
    expect(() => parseTasks(bad)).toThrow(/duplicate/i);
  });

  it("rejects [x] without done date", () => {
    const bad = `## Done
- [x] T-001 | S | Done no date | created:2026-08-27
`;
    expect(() => parseTasks(bad)).toThrow(/done/i);
  });

  it("rejects [x] not in Done section", () => {
    const bad = `## Backlog
- [x] T-001 | S | Done in backlog | done:2026-08-25
`;
    expect(() => parseTasks(bad)).toThrow(/inconsistent/i);
  });

  it("rejects done: date on a non-done task", () => {
    const bad = RAW.replace("created:2026-08-27 | est:2h", "done:2026-08-25 | est:2h");
    expect(() => parseTasks(bad)).toThrow(/non-done|done:/i);
  });

  it("throws TaskParseError instances", () => {
    expect(() => parseTasks(`## Backlog\n- [ ] T-1 | X | bad\n`)).toThrow(TaskParseError);
  });
});

describe("serializeTasks", () => {
  it("emits all three headers even when empty", () => {
    const out = serializeTasks([]);
    expect(out).toContain("## Backlog");
    expect(out).toContain("## In progress");
    expect(out).toContain("## Done");
  });

  it("indents subtasks by 2 spaces per depth", () => {
    const out = serializeTasks(parseTasks(RAW));
    expect(out).toMatch(/^  - \[ \] T-003\.1/m);
  });
});

describe("section ordering", () => {
  it("lists a completed decomposition in id order, not completion order", () => {
    // Completing subtasks one at a time moves each into ## Done without moving
    // it in the array, so raw array order would come out backwards.
    const tasks = parseTasks(
      "## Backlog\n- [ ] T-001 | L | Parent\n  - [ ] T-001.1 | S | One\n  - [ ] T-001.2 | S | Two\n  - [ ] T-001.3 | S | Three\n",
    );
    const completed = tasks.map((t) =>
      t.id === "T-001"
        ? t
        : { ...t, done: true, section: "done" as const, doneDate: "2026-08-29", created: undefined },
    );
    // Reverse the array to simulate the worst case ordering.
    const out = serializeTasks([...completed].reverse());
    const ids = out
      .split("\n")
      .filter((l) => l.includes("T-001."))
      .map((l) => l.trim().split(" ")[2]);
    expect(ids).toEqual(["T-001.1", "T-001.2", "T-001.3"]);
  });

  it("orders branches numerically, not as strings", () => {
    const raw =
      "## Backlog\n- [ ] T-002 | M | Second\n- [ ] T-010 | M | Tenth\n- [ ] T-001 | M | First\n";
    const out = serializeTasks(parseTasks(raw));
    const ids = out
      .split("\n")
      .filter((l) => l.startsWith("- ["))
      .map((l) => /T-[\d.]+/.exec(l)![0]);
    expect(ids).toEqual(["T-001", "T-002", "T-010"]);
  });

  it("keeps a parent and its subtask in different sections", () => {
    const raw =
      "## Backlog\n- [ ] T-001 | L | Parent\n\n## Done\n  - [x] T-001.1 | S | One | done:2026-08-29\n";
    expect(serializeTasks(parseTasks(raw))).toBe(serializeTasks(parseTasks(serializeTasks(parseTasks(raw)))));
  });
});

describe("target: field", () => {
  const line = (fields: string) => `## Backlog\n- [ ] T-001 | M | Audit${fields}\n`;

  it("parses a target reference", () => {
    expect(parseTasks(line(" | target:G-001"))[0].target).toBe("G-001");
  });

  it("is absent when not written", () => {
    expect(parseTasks(line(""))[0].target).toBeUndefined();
  });

  it("round-trips in the fixed field order, between lane: and waits:", () => {
    const raw =
      "## Backlog\n- [ ] T-001 | M | Audit | created:2026-08-29 | lane:deep | target:G-001 | waits:T-002\n";
    const once = serializeTasks(parseTasks(raw));
    expect(once).toContain(
      "- [ ] T-001 | M | Audit | created:2026-08-29 | lane:deep | target:G-001 | waits:T-002",
    );
    expect(serializeTasks(parseTasks(once))).toBe(once);
  });

  it("tolerates a target that does not exist — targets live in another file", () => {
    expect(parseTasks(line(" | target:G-999"))[0].target).toBe("G-999");
  });

  it("rejects a malformed target value", () => {
    expect(() => parseTasks(line(" | target:nonsense"))).toThrow(/invalid target/);
    expect(() => parseTasks(line(" | target:G-1"))).toThrow(/invalid target/);
  });

  it("still rejects an unknown key, so the grammar stays closed", () => {
    expect(() => parseTasks(line(" | targets:G-001"))).toThrow(/unknown field key/);
  });
});

describe("nextTaskId", () => {
  it("returns T-008 after T-007", () => {
    const tasks = parseTasks(`## Backlog
- [ ] T-007 | M | Last | created:2026-08-27
`);
    expect(nextTaskId(tasks)).toBe("T-008");
  });

  it("handles subtask-only ids", () => {
    const tasks: Task[] = [
      { id: "T-001.1", title: "Sub", size: "S", done: false, section: "backlog", created: "2026-08-27", parentId: "T-001" },
    ];
    expect(nextTaskId(tasks)).toBe("T-001");
  });

  it("returns T-001 when no tasks", () => {
    expect(nextTaskId([])).toBe("T-001");
  });
});
