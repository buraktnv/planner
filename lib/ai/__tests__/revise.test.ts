import { describe, expect, it } from "vitest";
import {
  MAX_REVISE_ACTIONS,
  parseRevise,
  renderRevisePrompt,
  toolNamesForRevise,
  type RevisePayload,
} from "../revise";
import { toolNames, type ProposalAction } from "../schemas";

const ACTIONS: ProposalAction[] = [
  { kind: "add_note", summary: "Attention is trained by environment." },
  { kind: "create_task", project: "area:health", title: "Phone out of the room", size: "S" },
];

function payload(over: Partial<RevisePayload> = {}): RevisePayload {
  return {
    instruction: "make the phone one due Friday",
    proposalId: "p-1",
    title: "Attention rebuild",
    actions: ACTIONS,
    dropped: 0,
    ...over,
  };
}

describe("parseRevise", () => {
  it("accepts a well-formed payload", () => {
    const result = parseRevise(payload());
    expect(result.ok).toBe(true);
  });

  it("refuses an empty instruction or an empty batch", () => {
    expect(parseRevise(payload({ instruction: "" })).ok).toBe(false);
    expect(parseRevise(payload({ actions: [] })).ok).toBe(false);
  });

  it("refuses actions that are not real proposal actions", () => {
    const result = parseRevise({
      instruction: "do something",
      actions: [{ kind: "rm_rf", path: "/" }],
    });
    expect(result.ok).toBe(false);
  });

  it("caps the row count", () => {
    const many = Array.from({ length: MAX_REVISE_ACTIONS + 1 }, () => ACTIONS[0]);
    expect(parseRevise(payload({ actions: many })).ok).toBe(false);
  });

  it("caps the byte size, which one long plan could blow on its own", () => {
    const huge: ProposalAction = {
      kind: "decompose_task",
      project: "acme-app",
      id: "T-001",
      subtasks: [{ title: "Round one", size: "M", plan: "x".repeat(40_000) }],
    };
    const result = parseRevise(payload({ actions: [huge] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/);
  });

  it("refuses nothing at all", () => {
    expect(parseRevise(undefined).ok).toBe(false);
    expect(parseRevise(null).ok).toBe(false);
  });
});

describe("toolNamesForRevise", () => {
  it("withholds every tool that writes a proposal action directly", () => {
    const allowed = new Set(toolNamesForRevise());
    for (const name of [
      "create_task",
      "update_task",
      "decompose_task",
      "move_to_parking_lot",
      "create_event",
      "update_event",
      "add_note",
      "update_note",
      "create_habit",
      "create_rhythm",
      "create_meal",
    ]) {
      expect(allowed.has(name as never), name).toBe(false);
    }
  });

  it("keeps propose_changes, which is the only thing it may do", () => {
    expect(toolNamesForRevise()).toContain("propose_changes");
  });

  it("keeps the read tools, so it can still check its work", () => {
    const allowed = toolNamesForRevise();
    for (const name of ["get_context", "list_targets", "search_knowledge", "read_note"]) {
      expect(allowed).toContain(name);
    }
  });

  it("withholds strictly less than everything, and nothing invented", () => {
    const allowed = toolNamesForRevise();
    expect(allowed.length).toBeLessThan(toolNames.length);
    for (const name of allowed) expect(toolNames).toContain(name);
  });
});

describe("renderRevisePrompt", () => {
  it("numbers the rows so 'the second one' resolves", () => {
    const text = renderRevisePrompt(payload());
    expect(text).toMatch(/1\. add_note: Attention is trained by environment\./);
    expect(text).toMatch(/2\. create_task: Phone out of the room/);
  });

  it("says plainly that nothing has been written", () => {
    expect(renderRevisePrompt(payload())).toMatch(/Nothing below has been written/);
  });

  it("carries the instruction and demands one complete batch back", () => {
    const text = renderRevisePrompt(payload());
    expect(text).toContain("make the phone one due Friday");
    expect(text).toMatch(/COMPLETE corrected/);
    expect(text).toMatch(/Do not write anything directly/);
  });

  it("tells it not to resurrect what the user removed", () => {
    const text = renderRevisePrompt(payload({ dropped: 2 }));
    expect(text).toMatch(/removed 2 rows/);
    expect(text).toMatch(/Do not re-add them/);
  });

  it("says nothing about dropped rows when none were dropped", () => {
    expect(renderRevisePrompt(payload({ dropped: 0 }))).not.toMatch(/Do not re-add/);
  });

  it("includes the actions as JSON, since the model must return a modified copy", () => {
    const text = renderRevisePrompt(payload());
    const json = text.slice(text.indexOf("```json") + 7, text.lastIndexOf("```"));
    expect(JSON.parse(json)).toEqual(ACTIONS);
  });

  it("truncates a very long title in the index but not in the JSON", () => {
    const long = "x".repeat(200);
    const text = renderRevisePrompt(
      payload({
        actions: [{ kind: "create_task", project: "a", title: long, size: "S" }],
      }),
    );
    expect(text).toMatch(/…/);
    expect(text).toContain(long);
  });
});
