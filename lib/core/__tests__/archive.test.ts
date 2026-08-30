import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-archive-"));
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

async function seedProject(name: string, mvp = "Ship it") {
  const { createCharter, addTask } = await import("../store");
  const charter = await createCharter({ type: "project", name, why: "because", mvp });
  await addTask("project", charter.id, { title: "First task", size: "M" });
  return charter;
}

describe("listArchived", () => {
  it("finds archived charters and maps the directory back to a type", async () => {
    const { archiveCharter, listArchived, createCharter } = await import("../store");
    await seedProject("Acme Jobs");
    const area = await createCharter({ type: "area", name: "Old Habit", why: "legacy" });
    await archiveCharter("project", "acme-jobs");
    await archiveCharter("area", area.id);

    const archived = await listArchived();
    expect(archived).toHaveLength(2);
    const byName = Object.fromEntries(archived.map((a) => [a.archivedAs, a]));
    expect(byName["acme-jobs"].type).toBe("project");
    expect(byName["old-habit"].type).toBe("area");
    expect(byName["acme-jobs"].archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns an empty list when nothing has been archived", async () => {
    const { listArchived } = await import("../store");
    expect(await listArchived()).toEqual([]);
  });

  it("does not leak archived charters into listCharters", async () => {
    const { archiveCharter, listCharters } = await import("../store");
    await seedProject("Acme App");
    await archiveCharter("project", "acme-app");
    expect(await listCharters()).toEqual([]);
  });
});

describe("listArchivedTasks", () => {
  it("reads the archived tasks file, including done tasks", async () => {
    const { archiveCharter, updateTask, listArchivedTasks } = await import("../store");
    await seedProject("Acme App");
    await updateTask("project", "acme-app", "T-001", { complete: true });
    await archiveCharter("project", "acme-app");

    const tasks = await listArchivedTasks("project", "acme-app");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].done).toBe(true);
    expect(tasks[0].section).toBe("done");
  });

  it("returns [] when the archived charter had no tasks", async () => {
    const { createCharter, archiveCharter, listArchivedTasks } = await import("../store");
    await createCharter({ type: "area", name: "Empty", why: "none" });
    await archiveCharter("area", "empty");
    expect(await listArchivedTasks("area", "empty")).toEqual([]);
  });
});

describe("listArchivedDetailIds", () => {
  it("sees the plans that moved into the archive with their charter", async () => {
    const { archiveCharter, addTask, listArchivedDetailIds } = await import("../store");
    const { writeDetail } = await import("../details");
    await seedProject("Acme App");
    await addTask("project", "acme-app", { title: "Second", size: "S", parentId: "T-001" });
    await writeDetail("project", "acme-app", "T-001", "branch plan");
    await writeDetail("project", "acme-app", "T-001.1", "leaf plan");

    await archiveCharter("project", "acme-app");

    expect((await listArchivedDetailIds("project", "acme-app")).sort()).toEqual([
      "T-001",
      "T-001.1",
    ]);
  });

  it("returns [] when the charter had no plans, and when it does not exist", async () => {
    const { archiveCharter, listArchivedDetailIds } = await import("../store");
    await seedProject("Acme App");
    await archiveCharter("project", "acme-app");
    expect(await listArchivedDetailIds("project", "acme-app")).toEqual([]);
    expect(await listArchivedDetailIds("project", "never-existed")).toEqual([]);
  });

  it("ignores files that are not task ids", async () => {
    const { archiveCharter, listArchivedDetailIds } = await import("../store");
    const { writeDetail } = await import("../details");
    await seedProject("Acme App");
    await writeDetail("project", "acme-app", "T-001", "real plan");
    await fs.writeFile(path.join(tmp, "projects", "acme-app", "details", "notes.md"), "stray", "utf8");

    await archiveCharter("project", "acme-app");

    expect(await listArchivedDetailIds("project", "acme-app")).toEqual(["T-001"]);
  });
});

describe("restoreCharter", () => {
  it("moves the charter and its task directory back, and journals", async () => {
    const { archiveCharter, restoreCharter, listCharters, listTasks } = await import("../store");
    await seedProject("Acme App");
    await archiveCharter("project", "acme-app");

    const res = await restoreCharter("project", "acme-app");
    expect(res.slug).toBe("acme-app");

    const live = await listCharters();
    expect(live.map((c) => c.id)).toEqual(["acme-app"]);
    expect(await listTasks("project", "acme-app")).toHaveLength(1);
    expect(fsSync.existsSync(path.join(tmp, "archive", "projects", "acme-app.md"))).toBe(false);
    expect(fsSync.existsSync(path.join(tmp, "archive", "projects", "acme-app"))).toBe(false);

    const date = new Date().toLocaleDateString("sv").slice(0, 10);
    const journal = await fs.readFile(path.join(tmp, "journal", `${date}.md`), "utf8");
    expect(journal).toContain("[acme-app] charter restored");
  });

  it("never overwrites a live charter that reclaimed the slug", async () => {
    const { archiveCharter, restoreCharter, getCharter, listCharters } = await import("../store");
    await seedProject("Acme App", "original mvp");
    await archiveCharter("project", "acme-app");
    await seedProject("Acme App", "the replacement");

    const res = await restoreCharter("project", "acme-app");
    expect(res.slug).toBe("acme-app-2");

    const survivor = await getCharter("project", "acme-app");
    expect(survivor.mvp).toBe("the replacement");
    const restored = await getCharter("project", "acme-app-2");
    expect(restored.mvp).toBe("original mvp");
    expect((await listCharters()).map((c) => c.id).sort()).toEqual(["acme-app", "acme-app-2"]);
  });

  it("keeps task details attached across archive and restore", async () => {
    const { archiveCharter, restoreCharter } = await import("../store");
    const { writeDetail, readDetail } = await import("../details");
    await seedProject("Acme App");
    await writeDetail("project", "acme-app", "T-001", "the plan survives");

    await archiveCharter("project", "acme-app");
    expect(
      fsSync.existsSync(path.join(tmp, "archive", "projects", "acme-app", "details", "T-001.md")),
    ).toBe(true);
    expect(await readDetail("project", "acme-app", "T-001")).toBeNull();

    await restoreCharter("project", "acme-app");
    expect(await readDetail("project", "acme-app", "T-001")).toBe("the plan survives\n");
  });

  it("throws for an archived charter that is not there", async () => {
    const { restoreCharter } = await import("../store");
    await expect(restoreCharter("project", "ghost")).rejects.toThrow(/Archived charter not found/);
  });
});
