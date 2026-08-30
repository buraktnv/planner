import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { proposalActionSchema, type ProposalAction } from "../schemas";

const calls = vi.hoisted(() => ({ order: [] as string[], fail: null as string | null }));

vi.mock("../tool-map", () => ({
  toolImplMap: new Proxy(
    {},
    {
      get: (_t, name: string) => async (input: Record<string, unknown>) => {
        calls.order.push(name);
        if (calls.fail === name) throw new Error(`${name} exploded`);
        return { name, input };
      },
    },
  ),
}));

let tmp: string;

beforeEach(() => {
  calls.order = [];
  calls.fail = null;
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-proposals-"));
  process.env.PLANNER_DATA_DIR = tmp;
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

async function writeCharter(slug: string, name: string) {
  const dir = path.join(tmp, "projects");
  await fs.mkdir(dir, { recursive: true });
  const rows = [
    `id: ${slug}`,
    `name: ${JSON.stringify(name)}`,
    "type: project",
    "status: active",
    "priority: 2",
    'mvp: "ship it"',
    "created: 2026-08-01",
    "updated: 2026-08-01",
  ];
  const body = ["## Why", "Fixture.", "", "## MVP scope", "", "## Parking lot"].join("\n");
  await fs.writeFile(path.join(dir, `${slug}.md`), `---\n${rows.join("\n")}\n---\n\n${body}\n`);
}

async function writeTasks(slug: string, backlog: string[]) {
  const dir = path.join(tmp, "projects", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "tasks.md"),
    ["## Backlog", ...backlog, "", "## In progress", "", "## Done", ""].join("\n"),
  );
}

describe("proposalActionSchema", () => {
  const good: unknown[] = [
    { kind: "create_task", project: "alpha", title: "Write the brief", size: "S" },
    { kind: "update_task", project: "alpha", id: "T-001", section: "in-progress" },
    {
      kind: "decompose_task",
      project: "alpha",
      id: "T-001",
      subtasks: [{ title: "Round one", size: "M" }],
    },
    { kind: "move_to_parking_lot", project: "alpha", idea: "Maybe later" },
    { kind: "create_event", date: "2026-09-01", title: "Kickoff" },
    { kind: "update_event", id: "E-001", done: true },
    { kind: "add_note", summary: "Uploads are content-addressed." },
    { kind: "update_note", id: "K-001", summary: "Still true." },
    { kind: "create_habit", name: "Walk", goal: 2, unit: "× 15 min" },
    { kind: "create_rhythm", name: "Laundry", per: 3 },
    { kind: "create_meal", name: "Lentil soup", servings: 2 },
  ];

  it("accepts every action kind", () => {
    for (const action of good) {
      expect(proposalActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    const parsed = proposalActionSchema.safeParse({ kind: "delete_everything", project: "alpha" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an action missing a required field", () => {
    expect(proposalActionSchema.safeParse({ kind: "create_task", project: "alpha" }).success).toBe(
      false,
    );
  });

  it("takes a due date, an estimate and a lane on a new task", () => {
    const parsed = proposalActionSchema.safeParse({
      kind: "create_task",
      project: "alpha",
      title: "Ship the exporter",
      size: "M",
      due: "2026-09-04",
      est: "2h",
      lane: "deep",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a lane that is not a board column", () => {
    const parsed = proposalActionSchema.safeParse({
      kind: "create_task",
      project: "alpha",
      title: "Ship it",
      size: "M",
      lane: "urgent",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a routine counted zero or fractional times", () => {
    expect(
      proposalActionSchema.safeParse({ kind: "create_habit", name: "Walk", goal: 0 }).success,
    ).toBe(false);
    expect(
      proposalActionSchema.safeParse({ kind: "create_rhythm", name: "Laundry", per: 1.5 }).success,
    ).toBe(false);
  });
});

describe("buildProposal", () => {
  it("builds one preview row per action with charter names, colours and lanes", async () => {
    const { buildProposal } = await import("../tools");
    const { hueOf } = await import("@/lib/ui/momentum");
    await writeCharter("alpha", "Alpha");
    await writeTasks("alpha", ["- [ ] T-001 | L | Rewrite the importer | created:2026-08-01"]);

    const proposal = await buildProposal({
      title: "Split the importer",
      summary: "Three rounds instead of one slab.",
      actions: [
        { kind: "create_task", project: "alpha", title: "Sketch the schema", size: "S" },
        { kind: "update_task", project: "alpha", id: "T-001", section: "in-progress" },
        {
          kind: "decompose_task",
          project: "alpha",
          id: "T-001",
          subtasks: [
            { title: "Round one", size: "M" },
            { title: "Round two", size: "M" },
          ],
        },
        { kind: "move_to_parking_lot", project: "alpha", idea: "Streaming importer" },
        { kind: "create_event", date: "2026-09-01", title: "Importer review", time: "09:40" },
      ],
    });

    expect(proposal.proposalId).toMatch(/^p-/);
    expect(proposal.title).toBe("Split the importer");
    expect(proposal.actions).toHaveLength(5);
    expect(proposal.preview).toHaveLength(5);

    expect(proposal.preview[0]).toMatchObject({
      kind: "create_task",
      id: "NEW",
      title: "Sketch the schema",
      lane: "quick",
      charterName: "Alpha",
      color: hueOf("alpha").color,
    });
    expect(proposal.preview[1]).toMatchObject({
      kind: "update_task",
      id: "T-001",
      title: "Rewrite the importer",
      lane: "deep",
    });
    expect(proposal.preview[2]).toMatchObject({
      kind: "decompose_task",
      id: "T-001",
      title: "Rewrite the importer",
      note: "2 subtasks",
    });
    expect(proposal.preview[3]).toMatchObject({
      kind: "move_to_parking_lot",
      id: "PARK",
      title: "Streaming importer",
      lane: "some",
    });
    expect(proposal.preview[4]).toMatchObject({
      kind: "create_event",
      id: "NEW",
      title: "Importer review",
      lane: null,
      note: "2026-09-01 09:40",
    });
  });

  it("writes nothing", async () => {
    const { buildProposal } = await import("../tools");
    await writeCharter("alpha", "Alpha");
    await writeTasks("alpha", []);
    const before = await fs.readFile(path.join(tmp, "projects", "alpha", "tasks.md"), "utf8");

    await buildProposal({
      title: "Add one",
      actions: [{ kind: "create_task", project: "alpha", title: "Nope", size: "M" }],
    });

    expect(await fs.readFile(path.join(tmp, "projects", "alpha", "tasks.md"), "utf8")).toBe(before);
  });

  it("throws on an empty action list", async () => {
    const { buildProposal } = await import("../tools");
    await expect(buildProposal({ title: "Nothing", actions: [] })).rejects.toThrow(/non-empty/);
  });

  /**
   * previewRow used to end in a bare else that treated anything it did not
   * recognise as update_event, so a new action kind previewed as a calendar
   * event instead of failing — the card would have described the wrong write.
   * This asserts every kind in the union previews as itself.
   */
  it("previews every action kind as its own kind", async () => {
    const { buildProposal } = await import("../tools");
    await writeCharter("alpha", "Alpha");
    await writeTasks("alpha", ["- [ ] T-001 | M | Existing | created:2026-08-01"]);

    const actions: ProposalAction[] = [
      { kind: "create_task", project: "alpha", title: "New one", size: "S" },
      { kind: "update_task", project: "alpha", id: "T-001", section: "in-progress" },
      {
        kind: "decompose_task",
        project: "alpha",
        id: "T-001",
        subtasks: [{ title: "Step", size: "S" }],
      },
      { kind: "move_to_parking_lot", project: "alpha", idea: "Later" },
      { kind: "create_event", date: "2026-09-01", title: "Review" },
      { kind: "update_event", id: "E-001", done: true },
      { kind: "add_note", summary: "A conclusion." },
      { kind: "update_note", id: "K-001", summary: "Still a conclusion." },
      { kind: "create_habit", name: "Walk", goal: 2 },
      { kind: "create_rhythm", name: "Laundry", per: 3 },
      { kind: "create_meal", name: "Soup", servings: 2 },
    ];

    const proposal = await buildProposal({ title: "Everything", actions });

    expect(proposal.preview).toHaveLength(actions.length);
    expect(proposal.preview.map((r) => r.kind)).toEqual(actions.map((a) => a.kind));
  });

  it("shows a proposed due date on the row, and honours an explicit lane", async () => {
    const { buildProposal } = await import("../tools");
    await writeCharter("alpha", "Alpha");
    await writeTasks("alpha", []);

    const proposal = await buildProposal({
      title: "Dated",
      actions: [
        {
          kind: "create_task",
          project: "alpha",
          title: "Ship the exporter",
          size: "S",
          due: "2026-09-04",
          lane: "deep",
        },
      ],
    });

    expect(proposal.preview[0].note).toBe("due 2026-09-04");
    expect(proposal.preview[0].lane).toBe("deep");
  });

  it("describes a routine by how it is counted", async () => {
    const { buildProposal } = await import("../tools");
    const proposal = await buildProposal({
      title: "Two trackers",
      actions: [
        { kind: "create_habit", name: "Focus blocks", goal: 4 },
        { kind: "create_rhythm", name: "Long walk", per: 2 },
        { kind: "create_meal", name: "Soup", servings: 3 },
      ],
    });

    expect(proposal.preview[0].note).toBe("habit · 4× a day");
    expect(proposal.preview[1].note).toBe("rhythm · 2× a week");
    expect(proposal.preview[2].note).toBe("meal · 3 servings");
    expect(proposal.preview.every((r) => r.charterName === "daily")).toBe(true);
  });
});

describe("applyProposal", () => {
  const actions: ProposalAction[] = [
    { kind: "create_task", project: "alpha", title: "One", size: "S" },
    { kind: "update_task", project: "alpha", id: "T-001", complete: true },
    { kind: "move_to_parking_lot", project: "alpha", idea: "Later" },
  ];

  it("runs the actions in order through toolImplMap", async () => {
    const { applyProposal } = await import("../proposals");
    const result = await applyProposal(actions);

    expect(calls.order).toEqual(["create_task", "update_task", "move_to_parking_lot"]);
    expect(result.failedIndex).toBeNull();
    expect(result.applied).toBe(3);
    expect(result.results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(result.results[0].result).toMatchObject({
      name: "create_task",
      input: { project: "alpha", title: "One", size: "S" },
    });
  });

  it("stops at the first failure and reports which action failed", async () => {
    calls.fail = "update_task";
    const { applyProposal } = await import("../proposals");
    const result = await applyProposal(actions);

    expect(calls.order).toEqual(["create_task", "update_task"]);
    expect(result.failedIndex).toBe(1);
    expect(result.applied).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(result.results[1]).toMatchObject({ kind: "update_task", ok: false });
    expect(result.results[1].error).toMatch(/exploded/);
  });
});
