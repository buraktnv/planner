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
