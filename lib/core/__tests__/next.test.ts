import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv").slice(0, 10);
}

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-next-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

describe("rankOpenTasks", () => {
  it("orders one charter's open tasks by the same tiers, blocked last, done excluded", async () => {
    const { rankOpenTasks } = await import("../next");
    const charter = {
      id: "alpha",
      name: "Alpha",
      type: "project" as const,
      status: "active" as const,
      priority: 1,
      created: "2026-08-01",
      updated: "2026-08-01",
      why: "",
      mvpScope: [],
      parkingLot: [],
    };
    const t = (id: string, extra: Record<string, unknown>) => ({
      id,
      title: id,
      size: "M" as const,
      done: false,
      section: "backlog" as const,
      parentId: null,
      ...extra,
    });
    const tasks = [
      t("T-001", { section: "in-progress" }),
      t("T-002", { due: "2026-01-01", waitsOn: "T-005" }),
      t("T-003", { due: "2026-01-01" }),
      t("T-004", { done: true, section: "done" }),
      t("T-005", {}),
      t("T-006", { due: "2999-01-01", size: "S" }),
    ];
    const ids = rankOpenTasks(tasks, charter, "2026-09-03").map((x) => x.id);
    expect(ids).toEqual(["T-003", "T-006", "T-001", "T-005", "T-002"]);
  });
});

describe("getNextActions", () => {
  it("ranks overdue, due-soon, in-progress then backlog by priority and size", async () => {
    const { createCharter, addTask, updateTask } = await import("../store");
    const { getNextActions } = await import("../next");

    const overdue = shift(-2);
    const soon = shift(1);

    const a = await createCharter({ type: "project", name: "Alpha", why: "a", mvp: "m", priority: 1 });
    await createCharter({ type: "area", name: "Beta", why: "b", priority: 3 });
    await createCharter({ type: "project", name: "Gamma", why: "g", mvp: "m", priority: 2 });

    const aOverdue = await addTask("project", a.id, { title: "Overdue big", size: "L", due: overdue });
    const aSoon = await addTask("project", a.id, { title: "Soon small", size: "S", due: soon });
    const aWip = await addTask("project", a.id, { title: "Wip medium", size: "M" });
    await updateTask("project", a.id, aWip.id, { section: "in-progress" });
    await addTask("project", a.id, { title: "Backlog small", size: "S" });

    const bOverdue = await addTask("area", "beta", { title: "Beta overdue", size: "S", due: overdue });
    const bWip = await addTask("area", "beta", { title: "Beta wip", size: "L" });
    await updateTask("area", "beta", bWip.id, { section: "in-progress" });

    await addTask("project", "gamma", { title: "Gamma backlog", size: "M" });

    const actions = await getNextActions();
    const ids = actions.map((x) => `${x.charter.id}/${x.task.id}`);

    expect(ids).toEqual([
      `alpha/${aOverdue.id}`,
      `beta/${bOverdue.id}`,
      `alpha/${aSoon.id}`,
      `alpha/${aWip.id}`,
      `beta/${bWip.id}`,
      "alpha/T-004",
      "gamma/T-001",
    ]);
  });

  it("excludes done tasks and caps at the limit", async () => {
    const { createCharter, addTask, updateTask } = await import("../store");
    const { getNextActions } = await import("../next");

    await createCharter({ type: "area", name: "Cap", why: "c", priority: 1 });
    const done = await addTask("area", "cap", { title: "Done one", size: "S" });
    await updateTask("area", "cap", done.id, { complete: true });
    for (let i = 0; i < 12; i++) {
      await addTask("area", "cap", { title: `Open ${i}`, size: "S" });
    }

    const actions = await getNextActions(10);
    expect(actions).toHaveLength(10);
    expect(actions.find((x) => x.task.id === done.id)).toBeUndefined();
  });
});

describe("blocked work matches the Focus page", () => {
  it("sinks a blocked task below open work, even when it is overdue", async () => {
    const { createCharter, addTask, updateTask } = await import("../store");
    const { getNextActions } = await import("../next");

    await createCharter({ type: "project", name: "Bot", why: "w", mvp: "ship it", priority: 1 });
    const blocker = await addTask("project", "bot", { title: "Camera control", size: "M" });
    const waiting = await addTask("project", "bot", {
      title: "YOLO nano",
      size: "S",
      due: shift(-3),
      waitsOn: blocker.id,
    });
    const free = await addTask("project", "bot", { title: "Anything else", size: "L" });

    const actions = await getNextActions(10);
    const ids = actions.map((a) => a.task.id);
    expect(ids.indexOf(waiting.id)).toBe(ids.length - 1);
    expect(ids.indexOf(free.id)).toBeLessThan(ids.indexOf(waiting.id));
    expect(actions.find((a) => a.task.id === waiting.id)?.blocked).toBe(true);
    expect(actions.find((a) => a.task.id === free.id)?.blocked).toBe(false);

    await updateTask("project", "bot", blocker.id, { complete: true });
    const after = await getNextActions(10);
    expect(after.find((a) => a.task.id === waiting.id)?.blocked).toBe(false);
    expect(after[0].task.id).toBe(waiting.id);
  });

  it("gives the same answer for a fixed today, whatever the clock says", async () => {
    const { createCharter, addTask } = await import("../store");
    const { getNextActions } = await import("../next");

    await createCharter({ type: "project", name: "Bot", why: "w", mvp: "ship it", priority: 1 });
    await addTask("project", "bot", { title: "Dated", size: "M", due: "2026-06-01" });
    await addTask("project", "bot", { title: "Undated", size: "S" });

    const ids = async (today: string) =>
      (await getNextActions(10, today)).map((a) => a.task.id);
    expect(await ids("2026-05-01")).toEqual(await ids("2026-05-01"));
    // Dated work outranks undated work either side of the due date. The
    // overdue-vs-upcoming tiers cannot reorder two dated tasks, because a
    // group-0 date is by definition earlier than a group-1 one — the split
    // exists for the copy, not the ordering.
    expect((await ids("2026-05-01"))[0]).toBe("T-001");
    expect((await ids("2026-07-01"))[0]).toBe("T-001");
  });
});
