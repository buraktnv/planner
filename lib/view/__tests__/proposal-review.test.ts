import { describe, expect, it } from "vitest";
import {
  applyEdit,
  blockingRefs,
  buildDraft,
  buildRevisePayload,
  draftStats,
  findSuccessor,
  latestOf,
  resolveLineage,
  reviseBubbleText,
  staleKeys,
  fieldsForKind,
  isSettled,
  opaqueFieldsFor,
  remainderDraft,
  selectedActions,
  setAllSelected,
  toggleRow,
  unresolvableRefs,
  validateAction,
  validateDraft,
} from "../proposal-review";
import {
  proposalActionSchema,
  type Proposal,
  type ProposalAction,
  type ProposalActionKind,
  type ProposalPreviewRow,
} from "@/lib/ai/schemas";

const KINDS: ProposalActionKind[] = [
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
];

function row(over: Partial<ProposalPreviewRow> = {}): ProposalPreviewRow {
  return {
    kind: "create_task",
    id: "NEW",
    title: "A row",
    lane: "quick",
    note: "",
    charterName: "Acme App",
    color: "#7d95dd",
    ...over,
  };
}

function proposalOf(actions: ProposalAction[], previews?: ProposalPreviewRow[]): Proposal {
  return {
    proposalId: "p-1",
    title: "A batch",
    summary: "Some changes.",
    actions,
    preview: previews ?? actions.map((a) => row({ kind: a.kind })),
  };
}

const BATCH: ProposalAction[] = [
  { kind: "add_note", summary: "Attention is trained by environment." },
  { kind: "create_task", project: "area:health", title: "Add the trackers", size: "S" },
  { kind: "create_task", project: "area:health", title: "Phone out of the room", size: "S" },
  { kind: "create_task", project: "area:health", title: "Grayscale on", size: "S" },
];

describe("buildDraft", () => {
  it("keeps rows in order, all selected, none edited", () => {
    const d = buildDraft(proposalOf(BATCH), "call-1");
    expect(d.rows.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(d.rows.every((r) => r.selected)).toBe(true);
    expect(d.rows.every((r) => !r.edited)).toBe(true);
    expect(d.toolCallId).toBe("call-1");
  });

  it("defaults the lineage to the first card, so a revision can carry it forward", () => {
    expect(buildDraft(proposalOf(BATCH), "call-1").lineageId).toBe("call-1");
    expect(buildDraft(proposalOf(BATCH), "call-2", "call-1").lineageId).toBe("call-1");
  });

  it("pairs each row with the preview built for it", () => {
    const d = buildDraft(proposalOf(BATCH), "c");
    expect(d.rows.map((r) => r.kind)).toEqual(BATCH.map((a) => a.kind));
    expect(d.rows[0].preview.kind).toBe("add_note");
  });
});

describe("toggleRow and selectedActions", () => {
  it("posts only the ticked rows, in their original order", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = toggleRow(d, 2);
    const actions = selectedActions(d);
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => ("title" in a ? a.title : a.kind))).toEqual([
      "add_note",
      "Add the trackers",
      "Grayscale on",
    ]);
  });

  it("ticks back on", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = toggleRow(d, 1);
    d = toggleRow(d, 1);
    expect(selectedActions(d)).toHaveLength(4);
  });

  it("selects and clears everything at once", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = setAllSelected(d, false);
    expect(selectedActions(d)).toHaveLength(0);
    d = setAllSelected(d, true);
    expect(selectedActions(d)).toHaveLength(4);
  });

  it("never re-posts a row that already landed", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = { ...d, rows: d.rows.map((r) => (r.index === 0 ? { ...r, applied: "ok" as const } : r)) };
    expect(selectedActions(d).map((a) => a.kind)).toEqual([
      "create_task",
      "create_task",
      "create_task",
    ]);
    d = toggleRow(d, 0);
    expect(selectedActions(d)).toHaveLength(3);
  });
});

describe("applyEdit", () => {
  it("changes a field and marks the row edited", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = applyEdit(d, 1, "title", "Add the attention trackers");
    expect((d.rows[1].action as { title: string }).title).toBe("Add the attention trackers");
    expect(d.rows[1].edited).toBe(true);
    expect(d.rows[0].edited).toBe(false);
  });

  it("stops being edited when the value is put back", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = applyEdit(d, 1, "title", "Changed");
    d = applyEdit(d, 1, "title", "Add the trackers");
    expect(d.rows[1].edited).toBe(false);
  });

  it("stores lead as a number and drops it when emptied", () => {
    const batch: ProposalAction[] = [{ kind: "create_event", date: "2026-09-24", title: "Passport" }];
    let d = buildDraft(proposalOf(batch), "c");
    d = applyEdit(d, 0, "lead", "21");
    expect((d.rows[0].action as { lead?: number }).lead).toBe(21);
    expect(validateAction(d.rows[0].action).ok).toBe(true);
    d = applyEdit(d, 0, "lead", "");
    expect("lead" in d.rows[0].action).toBe(false);
    d = applyEdit(d, 0, "repeat", "yearly");
    d = applyEdit(d, 0, "repeat", "");
    expect((d.rows[0].action as { repeat?: string }).repeat).toBe("");
    expect(validateAction(d.rows[0].action).ok).toBe(true);
  });

  it("adds a due date to a task that had none", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = applyEdit(d, 1, "due", "2026-09-04");
    const action = d.rows[1].action as { due?: string };
    expect(action.due).toBe("2026-09-04");
    expect(validateAction(d.rows[1].action).ok).toBe(true);
  });

  it("is a no-op on a key the kind does not have, rather than corrupting the action", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = applyEdit(d, 0, "servings", "4");
    expect(d.rows[0].action).toEqual(BATCH[0]);
    expect(d.rows[0].edited).toBe(false);
  });

  it("never throws on junk", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    expect(() => {
      d = applyEdit(d, 99, "title", "nowhere");
      d = applyEdit(d, 1, "", "");
      d = applyEdit(d, 1, "due", "not a date");
    }).not.toThrow();
  });

  it("reads a number field as a number so the schema still accepts it", () => {
    const habit: ProposalAction[] = [{ kind: "create_habit", name: "Walk", goal: 1 }];
    let d = buildDraft(proposalOf(habit), "c");
    d = applyEdit(d, 0, "goal", "4");
    expect((d.rows[0].action as { goal: number }).goal).toBe(4);
    expect(validateAction(d.rows[0].action).ok).toBe(true);
  });

  it("drops an emptied optional, but keeps '' where '' means clear the field", () => {
    const task: ProposalAction[] = [
      {
        kind: "create_task",
        project: "acme-app",
        title: "Ship it",
        size: "M",
        est: "2h",
        waitsOn: "T-041",
      },
    ];
    let d = buildDraft(proposalOf(task), "c");
    d = applyEdit(d, 0, "est", "");
    d = applyEdit(d, 0, "waitsOn", "");
    const action = d.rows[0].action as Record<string, unknown>;
    expect("est" in action).toBe(false);
    expect(action.waitsOn).toBe("");
  });

  it("clears a boolean rather than sending false", () => {
    const update: ProposalAction[] = [
      { kind: "update_task", project: "acme-app", id: "T-001", complete: true },
    ];
    let d = buildDraft(proposalOf(update), "c");
    d = applyEdit(d, 0, "complete", false);
    expect("complete" in (d.rows[0].action as Record<string, unknown>)).toBe(false);
  });

  it("leaves every edited action still parseable by the schema", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = applyEdit(d, 1, "size", "L");
    d = applyEdit(d, 1, "lane", "deep");
    d = applyEdit(d, 1, "due", "2026-12-01");
    for (const r of d.rows) {
      expect(proposalActionSchema.safeParse(r.action).success).toBe(true);
    }
  });
});

describe("fieldsForKind", () => {
  /**
   * The descriptors are written by hand, so this is the test that keeps them
   * honest: build an action out of nothing but the descriptors and require the
   * real schema to accept it. A renamed or removed field fails here.
   */
  it("describes fields the schema actually accepts, for every kind", () => {
    for (const kind of KINDS) {
      const value: Record<string, unknown> = { kind };
      for (const f of fieldsForKind(kind)) {
        if (!f.required) continue;
        value[f.key] =
          f.type === "number"
            ? 2
            : f.type === "boolean"
              ? true
              : f.type === "select"
                ? f.options?.[0]
                : f.type === "date"
                  ? "2026-09-04"
                  : "text";
      }
      if (kind === "decompose_task") value.subtasks = [{ title: "Step", size: "S" }];
      const parsed = proposalActionSchema.safeParse(value);
      expect(parsed.success, `${kind}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("accepts every optional field it advertises", () => {
    for (const kind of KINDS) {
      const required: Record<string, unknown> = { kind };
      for (const f of fieldsForKind(kind)) {
        if (f.required) {
          required[f.key] =
            f.type === "number" ? 2 : f.type === "select" ? f.options?.[0] : "text";
        }
      }
      if (kind === "decompose_task") required.subtasks = [{ title: "Step", size: "S" }];

      for (const f of fieldsForKind(kind)) {
        if (f.required) continue;
        const value = {
          ...required,
          [f.key]:
            f.type === "number"
              ? 2
              : f.type === "boolean"
                ? true
                : f.type === "select"
                  ? f.options?.[0]
                  : f.type === "date"
                    ? "2026-09-04"
                    : "text",
        };
        const parsed = proposalActionSchema.safeParse(value);
        expect(parsed.success, `${kind}.${f.key}`).toBe(true);
      }
    }
  });

  it("covers every kind in the union", () => {
    for (const kind of KINDS) {
      expect(fieldsForKind(kind).length, kind).toBeGreaterThan(0);
    }
  });

  it("offers the real board lanes and sizes", () => {
    const lane = fieldsForKind("create_task").find((f) => f.key === "lane");
    expect(lane?.options).toEqual(["quick", "deep", "wait", "some"]);
    const size = fieldsForKind("create_task").find((f) => f.key === "size");
    expect(size?.options).toEqual(["S", "M", "L"]);
  });
});

describe("opaqueFieldsFor", () => {
  it("shows subtasks read-only rather than pretending they are editable", () => {
    const fields = opaqueFieldsFor({
      kind: "decompose_task",
      project: "acme-app",
      id: "T-001",
      subtasks: [
        { title: "Round one", size: "M" },
        { title: "Round two", size: "S" },
      ],
    });
    expect(fields).toEqual([
      { label: "Subtask 1 (M)", value: "Round one" },
      { label: "Subtask 2 (S)", value: "Round two" },
    ]);
  });

  it("shows a note's scope, which is a list the editor cannot express", () => {
    expect(
      opaqueFieldsFor({ kind: "add_note", summary: "x", scope: ["acme-app", "area:health"] }),
    ).toEqual([{ label: "Scope", value: "acme-app, area:health" }]);
  });

  it("has nothing to add for a plain task", () => {
    expect(
      opaqueFieldsFor({ kind: "create_task", project: "a", title: "t", size: "S" }),
    ).toEqual([]);
  });
});

describe("validateAction", () => {
  it("rejects a negative or fractional lead and a cadence the calendar cannot hold", () => {
    const bad = validateAction({ kind: "create_event", date: "2026-09-04", title: "x", lead: -1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0].key).toBe("lead");
    expect(
      validateAction({ kind: "create_event", date: "2026-09-04", title: "x", lead: 2.5 }).ok,
    ).toBe(false);
    expect(
      validateAction({ kind: "create_event", date: "2026-09-04", title: "x", repeat: "daily" }).ok,
    ).toBe(false);
    expect(
      validateAction({ kind: "update_event", id: "E-001", repeat: "", lead: 0 }).ok,
    ).toBe(true);
  });

  it("accepts a well-formed action", () => {
    expect(validateAction(BATCH[1]).ok).toBe(true);
  });

  /**
   * An arrow is caught here rather than at apply time for the same reason a
   * date is: a bad ref draws nothing visible, so the row would look applied.
   */
  it("checks both ends of an arrow, and refuses one pointing at itself", () => {
    expect(
      validateAction({ kind: "connect_cards", project: "acme-app", from: "K-001", to: "K-002" }).ok,
    ).toBe(true);
    expect(
      validateAction({ kind: "connect_cards", from: "K-001", to: "group:core" }).ok,
    ).toBe(true);

    const bad = validateAction({ kind: "connect_cards", from: "camera", to: "K-002" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]).toMatchObject({ key: "from" });

    const loop = validateAction({ kind: "disconnect_cards", from: "K-001", to: "K-001" });
    expect(loop.ok).toBe(false);
    if (!loop.ok) expect(loop.issues[0]).toMatchObject({ key: "to" });
  });

  it("rejects a date that is not ISO", () => {
    const result = validateAction({
      kind: "create_task",
      project: "a",
      title: "t",
      size: "S",
      due: "friday",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toMatchObject({ key: "due" });
  });

  it("rejects a target or component id of the wrong shape", () => {
    const target = validateAction({
      kind: "create_task",
      project: "a",
      title: "t",
      size: "S",
      target: "G-1",
    });
    expect(target.ok).toBe(false);

    const note = validateAction({
      kind: "create_task",
      project: "a",
      title: "t",
      size: "S",
      note: "component",
    });
    expect(note.ok).toBe(false);
  });

  it("accepts an empty string where empty means clear the field", () => {
    expect(
      validateAction({ kind: "update_task", project: "a", id: "T-001", target: "" }).ok,
    ).toBe(true);
  });

  it("rejects a task id of the wrong shape but accepts a dotted subtask id", () => {
    expect(validateAction({ kind: "update_task", project: "a", id: "task one" }).ok).toBe(false);
    expect(validateAction({ kind: "update_task", project: "a", id: "T-007.2" }).ok).toBe(true);
  });

  it("holds the calendar's 12-character limit on time", () => {
    const result = validateAction({
      kind: "create_event",
      date: "2026-09-01",
      title: "Review",
      time: "half past four in the afternoon",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects free-text waitsOn containing the field delimiter", () => {
    const result = validateAction({
      kind: "create_task",
      project: "a",
      title: "t",
      size: "S",
      waitsOn: "the clinic | maybe",
    });
    expect(result.ok).toBe(false);
  });

  it("reports the offending field rather than a bare failure", () => {
    const result = validateAction({ kind: "create_task", project: "a", size: "S" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.key === "title")).toBe(true);
  });

  it("rejects junk without throwing", () => {
    expect(validateAction(null).ok).toBe(false);
    expect(validateAction({ kind: "nonsense" }).ok).toBe(false);
  });
});

describe("validateDraft", () => {
  it("ignores rows the user has unticked", () => {
    let d = buildDraft(
      proposalOf([
        { kind: "create_task", project: "a", title: "Fine", size: "S" },
        { kind: "create_task", project: "a", title: "Bad", size: "S", due: "friday" },
      ]),
      "c",
    );
    expect(validateDraft(d).ok).toBe(false);
    d = toggleRow(d, 1);
    expect(validateDraft(d).ok).toBe(true);
  });

  it("reports issues per row index", () => {
    const d = buildDraft(
      proposalOf([
        { kind: "create_task", project: "a", title: "Fine", size: "S" },
        { kind: "create_task", project: "a", title: "Bad", size: "S", target: "nope" },
      ]),
      "c",
    );
    const result = validateDraft(d);
    expect(Object.keys(result.rowIssues)).toEqual(["1"]);
  });
});

describe("unresolvableRefs", () => {
  it("catches decomposing a task the batch has not created yet", () => {
    // previewRow leaves `scope` off when findTask could not resolve the id.
    const d = buildDraft(
      proposalOf(
        [
          { kind: "create_task", project: "acme-app", title: "Rewrite the importer", size: "L" },
          {
            kind: "decompose_task",
            project: "acme-app",
            id: "T-002",
            subtasks: [{ title: "Round one", size: "M" }],
          },
        ],
        [row({ kind: "create_task" }), row({ kind: "decompose_task", id: "T-002" })],
      ),
      "c",
    );
    const refs = unresolvableRefs(d);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ index: 1, id: "T-002" });
    expect(refs[0].label).toMatch(/no id yet/);
  });

  it("leaves a decompose of a task that really exists alone", () => {
    const d = buildDraft(
      proposalOf(
        [
          {
            kind: "decompose_task",
            project: "acme-app",
            id: "T-001",
            subtasks: [{ title: "Round one", size: "M" }],
          },
        ],
        [row({ kind: "decompose_task", id: "T-001", scope: "acme-app" })],
      ),
      "c",
    );
    expect(unresolvableRefs(d)).toEqual([]);
  });

  it("catches an update of a task that is not there", () => {
    const d = buildDraft(
      proposalOf(
        [{ kind: "update_task", project: "acme-app", id: "T-404", complete: true }],
        [row({ kind: "update_task", id: "T-404" })],
      ),
      "c",
    );
    expect(unresolvableRefs(d)[0].label).toMatch(/nothing to update/);
  });

  it("says nothing about kinds that reference no task", () => {
    const d = buildDraft(proposalOf(BATCH), "c");
    expect(unresolvableRefs(d)).toEqual([]);
  });

  it("only blocks Accept while the offending row is still ticked", () => {
    let d = buildDraft(
      proposalOf(
        [{ kind: "update_task", project: "acme-app", id: "T-404", complete: true }],
        [row({ kind: "update_task", id: "T-404" })],
      ),
      "c",
    );
    expect(blockingRefs(d)).toHaveLength(1);
    d = toggleRow(d, 0);
    expect(blockingRefs(d)).toHaveLength(0);
    expect(unresolvableRefs(d)).toHaveLength(1);
  });
});

describe("remainderDraft", () => {
  it("keeps what landed out of the next Accept, so nothing is written twice", () => {
    const d = buildDraft(proposalOf(BATCH), "c");
    const after = remainderDraft(d, {
      applied: 2,
      failedIndex: 2,
      results: [
        { kind: "add_note", ok: true },
        { kind: "create_task", ok: true },
        { kind: "create_task", ok: false, error: "Target not found: G-009" },
      ],
    });

    expect(after.rows[0].applied).toBe("ok");
    expect(after.rows[1].applied).toBe("ok");
    expect(after.rows[0].selected).toBe(false);
    expect(selectedActions(after)).toHaveLength(2);
  });

  it("pre-selects the failed row with its error, and never retries it silently", () => {
    const d = buildDraft(proposalOf(BATCH), "c");
    const after = remainderDraft(d, {
      applied: 2,
      failedIndex: 2,
      results: [
        { kind: "add_note", ok: true },
        { kind: "create_task", ok: true },
        { kind: "create_task", ok: false, error: "Target not found: G-009" },
      ],
    });
    expect(after.rows[2]).toMatchObject({
      applied: "failed",
      selected: true,
      error: "Target not found: G-009",
    });
  });

  it("maps outcomes onto the rows that were actually sent, not row order", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = toggleRow(d, 0); // row 0 not sent
    const after = remainderDraft(d, {
      applied: 1,
      failedIndex: 1,
      results: [
        { kind: "create_task", ok: true },
        { kind: "create_task", ok: false, error: "boom" },
      ],
    });
    expect(after.rows[0].applied).toBeUndefined();
    expect(after.rows[1].applied).toBe("ok");
    expect(after.rows[2].applied).toBe("failed");
    expect(after.rows[3].applied).toBeUndefined();
  });

  it("marks a whole successful batch settled", () => {
    const d = buildDraft(proposalOf([BATCH[0]]), "c");
    const after = remainderDraft(d, {
      applied: 1,
      failedIndex: null,
      results: [{ kind: "add_note", ok: true }],
    });
    expect(isSettled(after)).toBe(true);
    expect(selectedActions(after)).toHaveLength(0);
  });
});

describe("draftStats", () => {
  it("counts what is about to happen", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    expect(draftStats(d).label).toBe("Accept 4 changes");
    d = toggleRow(d, 3);
    expect(draftStats(d)).toMatchObject({ total: 4, selected: 3, label: "Accept 3 of 4" });
    d = applyEdit(d, 1, "title", "Renamed");
    expect(draftStats(d).edited).toBe(1);
  });

  it("says so plainly when nothing is ticked", () => {
    const d = setAllSelected(buildDraft(proposalOf(BATCH), "c"), false);
    expect(draftStats(d).label).toBe("Nothing selected");
  });

  it("counts only what is left after a partial apply", () => {
    const d = buildDraft(proposalOf(BATCH), "c");
    const after = remainderDraft(d, {
      applied: 1,
      failedIndex: 1,
      results: [
        { kind: "add_note", ok: true },
        { kind: "create_task", ok: false, error: "boom" },
      ],
    });
    const stats = draftStats(after);
    expect(stats.applied).toBe(1);
    expect(stats.label).toBe("Accept 3 changes");
  });
});

describe("buildRevisePayload", () => {
  it("sends the ticked rows, carrying hand edits", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = applyEdit(d, 1, "title", "Add the attention trackers");
    d = toggleRow(d, 3);
    const payload = buildRevisePayload(d, "  make the phone one due Friday  ");

    expect(payload).not.toBeNull();
    expect(payload?.instruction).toBe("make the phone one due Friday");
    expect(payload?.actions).toHaveLength(3);
    expect((payload?.actions[1] as { title: string }).title).toBe("Add the attention trackers");
  });

  /**
   * The row the user just removed must not go to the model, or it comes back in
   * the revised batch every round.
   */
  it("leaves unticked rows out entirely, and says how many went", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = toggleRow(d, 2);
    d = toggleRow(d, 3);
    const payload = buildRevisePayload(d, "tighten these up");
    expect(payload?.actions.map((a) => a.kind)).toEqual(["add_note", "create_task"]);
    expect(payload?.dropped).toBe(2);
  });

  it("is null when there is nothing to revise or nothing was asked", () => {
    const d = buildDraft(proposalOf(BATCH), "c");
    expect(buildRevisePayload(d, "   ")).toBeNull();
    expect(buildRevisePayload(setAllSelected(d, false), "change it")).toBeNull();
  });

  it("never re-sends a row that already landed", () => {
    const d = buildDraft(proposalOf(BATCH), "c");
    const after = remainderDraft(d, {
      applied: 1,
      failedIndex: 1,
      results: [
        { kind: "add_note", ok: true },
        { kind: "create_task", ok: false, error: "boom" },
      ],
    });
    const payload = buildRevisePayload(after, "fix it");
    expect(payload?.actions.every((a) => a.kind === "create_task")).toBe(true);
  });
});

describe("reviseBubbleText", () => {
  it("shows the instruction and what actually left the client", () => {
    let d = buildDraft(proposalOf(BATCH), "c");
    d = toggleRow(d, 3);
    const payload = buildRevisePayload(d, "make the phone one due Friday");
    expect(payload && reviseBubbleText(payload)).toBe(
      "make the phone one due Friday\n\n(revising 3 changes, 1 dropped)",
    );
  });

  it("says nothing about dropped rows when none were", () => {
    const d = buildDraft(proposalOf([BATCH[0]]), "c");
    const payload = buildRevisePayload(d, "reword it");
    expect(payload && reviseBubbleText(payload)).toBe("reword it\n\n(revising 1 change)");
  });
});

describe("findSuccessor", () => {
  const origin = {
    sessionId: "s1",
    lineageId: "call-1",
    toolCallId: "call-1",
    afterMessageId: "m1",
    sentAt: 0,
  };

  const proposalPart = (toolCallId: string, state = "output-available") => ({
    type: "tool-propose_changes",
    toolCallId,
    state,
  });

  it("waits for the turn to settle before replacing anything", () => {
    const messages = [
      { id: "m1", role: "user", parts: [] },
      { id: "m2", role: "assistant", parts: [proposalPart("call-2")] },
    ];
    expect(findSuccessor(messages, origin, false)).toBeNull();
    expect(findSuccessor(messages, origin, true)).toEqual({ toolCallId: "call-2" });
  });

  it("ignores anything before the revise was sent", () => {
    const messages = [
      { id: "m0", role: "assistant", parts: [proposalPart("call-0")] },
      { id: "m1", role: "user", parts: [] },
    ];
    expect(findSuccessor(messages, origin, true)).toBeNull();
  });

  /** stepCountIs(6) allows two; the first would leave a live card to double-apply. */
  it("takes the last proposal of the turn, not the first", () => {
    const messages = [
      { id: "m1", role: "user", parts: [] },
      { id: "m2", role: "assistant", parts: [proposalPart("call-2"), proposalPart("call-3")] },
    ];
    expect(findSuccessor(messages, origin, true)).toEqual({ toolCallId: "call-3" });
  });

  it("ignores a proposal that has not finished streaming", () => {
    const messages = [
      { id: "m1", role: "user", parts: [] },
      { id: "m2", role: "assistant", parts: [proposalPart("call-2", "input-available")] },
    ];
    expect(findSuccessor(messages, origin, true)).toBeNull();
  });

  it("never resolves to the card being revised", () => {
    const messages = [
      { id: "m1", role: "user", parts: [] },
      { id: "m2", role: "assistant", parts: [proposalPart("call-1")] },
    ];
    expect(findSuccessor(messages, origin, true)).toBeNull();
  });

  /** A prose-only reply must leave the card usable, not stuck revising. */
  it("returns null when the model answered without proposing anything", () => {
    const messages = [
      { id: "m1", role: "user", parts: [] },
      { id: "m2", role: "assistant", parts: [{ type: "text" }] },
    ];
    expect(findSuccessor(messages, origin, true)).toBeNull();
  });

  it("recognises the subscription path's prefixed tool name", () => {
    const messages = [
      { id: "m1", role: "user", parts: [] },
      {
        id: "m2",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "mcp__planner__propose_changes",
            toolCallId: "call-9",
            state: "output-available",
          },
        ],
      },
    ];
    expect(findSuccessor(messages, origin, true)).toEqual({ toolCallId: "call-9" });
  });

  it("gives up when the message it was anchored to is gone, as after a session switch", () => {
    const messages = [{ id: "other", role: "assistant", parts: [proposalPart("call-2")] }];
    expect(findSuccessor(messages, origin, true)).toBeNull();
  });
});

describe("resolveLineage", () => {
  const origin = (over: Partial<Parameters<typeof findSuccessor>[1]> = {}) => ({
    sessionId: "s1",
    lineageId: "call-1",
    toolCallId: "call-1",
    afterMessageId: "m1",
    sentAt: 0,
    ...over,
  });

  const proposalPart = (toolCallId: string) => ({
    type: "tool-propose_changes",
    toolCallId,
    state: "output-available",
  });

  const settledMessages = [
    { id: "m1", role: "user", parts: [] },
    { id: "m2", role: "assistant", parts: [proposalPart("call-2")] },
  ];

  it("links a card to the one that replaced it, and carries the lineage over", () => {
    const state = resolveLineage([origin()], settledMessages, false, "s1");
    expect(state.supersededBy).toEqual({ "call-1": "call-2" });
    expect(state.lineageOf).toEqual({ "call-2": "call-1" });
    expect(state.pending).toBeNull();
    expect(state.unanswered).toBeNull();
  });

  it("reports a revision still in flight", () => {
    const state = resolveLineage([origin()], [{ id: "m1", role: "user", parts: [] }], true, "s1");
    expect(state.pending?.toolCallId).toBe("call-1");
    expect(state.supersededBy).toEqual({});
  });

  it("reports a settled turn that produced no new batch", () => {
    const state = resolveLineage(
      [origin()],
      [
        { id: "m1", role: "user", parts: [] },
        { id: "m2", role: "assistant", parts: [{ type: "text" }] },
      ],
      false,
      "s1",
    );
    expect(state.unanswered?.toolCallId).toBe("call-1");
    expect(state.pending).toBeNull();
  });

  it("ignores origins from another conversation, since a switch does not abort the stream", () => {
    const state = resolveLineage([origin({ sessionId: "s2" })], settledMessages, false, "s1");
    expect(state.supersededBy).toEqual({});
    expect(state.pending).toBeNull();
    expect(state.unanswered).toBeNull();
  });

  it("chains several rounds of revision", () => {
    const messages = [
      { id: "m1", role: "user", parts: [] },
      { id: "m2", role: "assistant", parts: [proposalPart("call-2")] },
      { id: "m3", role: "user", parts: [] },
      { id: "m4", role: "assistant", parts: [proposalPart("call-3")] },
    ];
    const state = resolveLineage(
      [origin(), origin({ toolCallId: "call-2", afterMessageId: "m3" })],
      messages,
      false,
      "s1",
    );
    expect(state.supersededBy["call-1"]).toBe("call-2");
    expect(state.supersededBy["call-2"]).toBe("call-3");
    expect(state.lineageOf["call-3"]).toBe("call-1");
  });
});

describe("latestOf", () => {
  it("follows a card through several revisions", () => {
    const chain = { a: "b", b: "c" };
    expect(latestOf("a", chain)).toBe("c");
    expect(latestOf("c", chain)).toBe("c");
  });

  it("returns the key untouched when nothing replaced it", () => {
    expect(latestOf("a", {})).toBe("a");
  });

  it("does not spin on a cycle", () => {
    expect(latestOf("a", { a: "b", b: "a" })).toBeTypeOf("string");
  });
});

describe("staleKeys", () => {
  /**
   * Applying two cards of one lineage runs every action twice, and addTask
   * mints a fresh id each call — there is no collision to stop it.
   */
  it("marks the rest of a lineage stale once one of them is applied", () => {
    const drafts = {
      "call-1": buildDraft(proposalOf(BATCH), "call-1"),
      "call-2": buildDraft(proposalOf(BATCH), "call-2", "call-1"),
      "call-9": buildDraft(proposalOf(BATCH), "call-9"),
    };
    expect(staleKeys(drafts, ["call-2"])).toEqual(["call-1"]);
    expect(staleKeys(drafts, ["call-1"])).toEqual(["call-2"]);
  });

  it("leaves an unrelated card alone", () => {
    const drafts = {
      "call-1": buildDraft(proposalOf(BATCH), "call-1"),
      "call-9": buildDraft(proposalOf(BATCH), "call-9"),
    };
    expect(staleKeys(drafts, ["call-1"])).toEqual([]);
  });

  it("is empty when nothing has been applied", () => {
    const drafts = { "call-1": buildDraft(proposalOf(BATCH), "call-1") };
    expect(staleKeys(drafts, [])).toEqual([]);
  });
});
