import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-ai-detail-"));
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
  const parent = await addTask("project", "acme-app", { title: "Billing system", size: "L" });
  return parent;
}

async function seedArea() {
  const { createCharter, addTask } = await import("@/lib/core/store");
  await createCharter({ type: "area", name: "Health", why: "stay well" });
  return addTask("area", "health", { title: "Book the check-up", size: "S" });
}

describe("readTaskDetail / writeTaskDetail", () => {
  it("round-trips a plan for a project task", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedProject();

    const written = await toolImpls.writeTaskDetail({
      project: "acme-app",
      id: task.id,
      body: "## Plan\nInvoices first, then dunning.",
    });
    expect(written.body).toContain("Invoices first");

    const read = await toolImpls.readTaskDetail({ project: "acme-app", id: task.id });
    expect(read.id).toBe(task.id);
    expect(read.body).toContain("dunning");
  });

  it("resolves an area:<slug> scope to the areas directory", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedArea();

    await toolImpls.writeTaskDetail({
      project: "area:health",
      id: task.id,
      body: "Ask about the referral.",
    });

    expect(fsSync.existsSync(path.join(tmp, "areas", "health", "details", `${task.id}.md`))).toBe(
      true,
    );
    const read = await toolImpls.readTaskDetail({ project: "area:health", id: task.id });
    expect(read.body).toContain("referral");
  });

  it("returns an empty body when no plan is written yet", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedProject();
    const read = await toolImpls.readTaskDetail({ project: "acme-app", id: task.id });
    expect(read.body).toBe("");
  });

  it("refuses to write a plan for a task that does not exist, and writes no file", async () => {
    const { toolImpls } = await import("../tools");
    await seedProject();

    await expect(
      toolImpls.writeTaskDetail({ project: "acme-app", id: "T-999", body: "orphan" }),
    ).rejects.toThrow(/Task not found: T-999/);

    expect(fsSync.existsSync(path.join(tmp, "projects", "acme-app", "details", "T-999.md"))).toBe(
      false,
    );
  });

  it("rejects a task id that could escape the details directory", async () => {
    const { toolImpls } = await import("../tools");
    await seedProject();
    await expect(
      toolImpls.readTaskDetail({ project: "acme-app", id: "../../evil" }),
    ).rejects.toThrow(/Invalid task id/);
  });

  it("requires a project and an id", async () => {
    const { toolImpls } = await import("../tools");
    await expect(toolImpls.readTaskDetail({ project: "", id: "T-001" })).rejects.toThrow(
      /requires a project/,
    );
    await expect(toolImpls.writeTaskDetail({ project: "acme-app", id: "", body: "x" })).rejects.toThrow(
      /requires an id/,
    );
  });

  it("clears the plan when handed an empty body", async () => {
    const { toolImpls } = await import("../tools");
    const task = await seedProject();
    await toolImpls.writeTaskDetail({ project: "acme-app", id: task.id, body: "temporary" });
    const cleared = await toolImpls.writeTaskDetail({ project: "acme-app", id: task.id, body: "" });
    expect(cleared.body).toBe("");
    expect(fsSync.existsSync(path.join(tmp, "projects", "acme-app", "details", `${task.id}.md`))).toBe(
      false,
    );
  });
});

describe("decomposeTask with plans", () => {
  it("attaches each plan to the subtask id that was actually created", async () => {
    const { toolImpls } = await import("../tools");
    const { readDetail } = await import("@/lib/core/details");
    const parent = await seedProject();

    const created = await toolImpls.decomposeTask({
      project: "acme-app",
      id: parent.id,
      subtasks: [
        { title: "Invoices schema", size: "M", plan: "One row per invoice line." },
        { title: "Dunning emails", size: "S", plan: "Three reminders, then stop." },
      ],
    });

    expect(created).toHaveLength(2);
    expect(created[0].id).toBe(`${parent.id}.1`);
    expect(created[1].id).toBe(`${parent.id}.2`);

    expect(await readDetail("project", "acme-app", created[0].id)).toContain("One row per invoice");
    expect(await readDetail("project", "acme-app", created[1].id)).toContain("Three reminders");
  });

  it("leaves subtasks without a plan alone", async () => {
    const { toolImpls } = await import("../tools");
    const { readDetail, listDetailIds } = await import("@/lib/core/details");
    const parent = await seedProject();

    const created = await toolImpls.decomposeTask({
      project: "acme-app",
      id: parent.id,
      subtasks: [
        { title: "Has a plan", size: "M", plan: "keep this" },
        { title: "No plan", size: "S" },
        { title: "Blank plan", size: "S", plan: "   " },
      ],
    });

    expect(await readDetail("project", "acme-app", created[1].id)).toBeNull();
    expect(await readDetail("project", "acme-app", created[2].id)).toBeNull();
    expect(await listDetailIds("project", "acme-app")).toEqual([created[0].id]);
  });

  it("reads a subtask plan back through the tool", async () => {
    const { toolImpls } = await import("../tools");
    const parent = await seedProject();
    const created = await toolImpls.decomposeTask({
      project: "acme-app",
      id: parent.id,
      subtasks: [{ title: "Invoices schema", size: "M", plan: "One row per invoice line." }],
    });

    const read = await toolImpls.readTaskDetail({ project: "acme-app", id: created[0].id });
    expect(read.id).toBe(`${parent.id}.1`);
    expect(read.body).toContain("One row per invoice");
  });
});
