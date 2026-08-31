import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-ai-comments-"));
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

async function seedProject() {
  const { createCharter, addTask } = await import("@/lib/core/store");
  await createCharter({ type: "project", name: "Acme App", why: "trade", mvp: "ship" });
  return addTask("project", "acme-app", { title: "Billing system", size: "L" });
}

async function seedArea() {
  const { createCharter, addTask } = await import("@/lib/core/store");
  await createCharter({ type: "area", name: "Health", why: "stay well" });
  return addTask("area", "health", { title: "Book the check-up", size: "S" });
}

describe("addTaskComment / readTaskComments", () => {
  it("appends entries and reads them back oldest first", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedProject();

    await toolImpls.addTaskComment({
      project: "acme-app",
      id: task.id,
      body: "Tried the ledger table. Double-counts refunds.",
    });
    await toolImpls.addTaskComment({
      project: "acme-app",
      id: task.id,
      body: "Backed it out. Using an events log instead.",
    });

    const read = await toolImpls.readTaskComments({ project: "acme-app", id: task.id });
    expect(read.id).toBe(task.id);
    expect(read.entries.map((e) => e.body)).toEqual([
      "Tried the ledger table. Double-counts refunds.",
      "Backed it out. Using an events log instead.",
    ]);
  });

  it("refuses an id with no task, and writes no orphan file", async () => {
    const { toolImpls } = await import("../tools");
    const { listCommentedIds } = await import("@/lib/core/comments");
    await seedProject();

    await expect(
      toolImpls.addTaskComment({ project: "acme-app", id: "T-999", body: "nope" }),
    ).rejects.toThrow(/Task not found/);
    expect(await listCommentedIds("project", "acme-app")).toEqual([]);
  });

  it("resolves an area:<slug> scope to the areas directory", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedArea();

    await toolImpls.addTaskComment({
      project: "area:health",
      id: task.id,
      body: "clinic is booked out until October",
    });

    expect(
      fsSync.existsSync(path.join(tmp, "areas", "health", "comments", `${task.id}.md`)),
    ).toBe(true);
    const read = await toolImpls.readTaskComments({ project: "area:health", id: task.id });
    expect(read.entries[0].body).toContain("booked out");
  });

  it("returns an empty list for a task that has never been logged", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedProject();
    const read = await toolImpls.readTaskComments({ project: "acme-app", id: task.id });
    expect(read.entries).toEqual([]);
  });

  it("honours limit by returning the most recent entries", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedProject();
    for (const body of ["one", "two", "three"]) {
      await toolImpls.addTaskComment({ project: "acme-app", id: task.id, body });
    }
    const read = await toolImpls.readTaskComments({
      project: "acme-app",
      id: task.id,
      limit: 2,
    });
    expect(read.entries.map((e) => e.body)).toEqual(["two", "three"]);
  });
});

describe("createTask with a description", () => {
  it("writes the description so no second call is needed", async () => {
    const { toolImpls } = await import("../tools");
    const { readDetail } = await import("@/lib/core/details");
    const { createCharter } = await import("@/lib/core/store");
    await createCharter({ type: "project", name: "Acme App", why: "trade", mvp: "ship" });

    const task = await toolImpls.createTask({
      project: "acme-app",
      title: "Fix the import path",
      size: "S",
      description: "Breaks only on CI. Suspect the tsconfig paths.",
    });

    expect(await readDetail("project", "acme-app", task.id)).toContain("only on CI");
  });

  it("writes nothing when no description is given", async () => {
    const { toolImpls } = await import("../tools");
    const { listDetailIds } = await import("@/lib/core/details");
    const { createCharter } = await import("@/lib/core/store");
    await createCharter({ type: "project", name: "Acme App", why: "trade", mvp: "ship" });

    await toolImpls.createTask({ project: "acme-app", title: "Bare task", size: "S" });
    expect(await listDetailIds("project", "acme-app")).toEqual([]);
  });
});

describe("decomposeTask records why it split", () => {
  it("logs the reason on the parent, not on a subtask", async () => {
    const { toolImpls } = await import("../tools");
    const { readComments } = await import("@/lib/core/comments");
    const parent = await seedProject();

    const created = await toolImpls.decomposeTask({
      project: "acme-app",
      id: parent.id,
      reason: "Auth turned out to be its own piece of work.",
      subtasks: [
        { title: "Invoices schema", size: "M" },
        { title: "Auth for the portal", size: "M" },
      ],
    });

    const onParent = await readComments("project", "acme-app", parent.id);
    expect(onParent).toHaveLength(1);
    expect(onParent[0].body).toContain("its own piece of work");

    expect(await readComments("project", "acme-app", created[0].id)).toEqual([]);
  });

  it("logs nothing when no reason is given", async () => {
    const { toolImpls } = await import("../tools");
    const { listCommentedIds } = await import("@/lib/core/comments");
    const parent = await seedProject();

    await toolImpls.decomposeTask({
      project: "acme-app",
      id: parent.id,
      subtasks: [{ title: "Invoices schema", size: "M" }],
    });

    expect(await listCommentedIds("project", "acme-app")).toEqual([]);
  });
});
