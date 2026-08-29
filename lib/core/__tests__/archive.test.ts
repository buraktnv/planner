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
    await seedProject("Job Search Automation");
    const area = await createCharter({ type: "area", name: "Old Habit", why: "legacy" });
    await archiveCharter("project", "job-search-automation");
    await archiveCharter("area", area.id);

    const archived = await listArchived();
    expect(archived).toHaveLength(2);
    const byName = Object.fromEntries(archived.map((a) => [a.archivedAs, a]));
    expect(byName["job-search-automation"].type).toBe("project");
    expect(byName["old-habit"].type).toBe("area");
    expect(byName["job-search-automation"].archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns an empty list when nothing has been archived", async () => {
    const { listArchived } = await import("../store");
    expect(await listArchived()).toEqual([]);
  });

  it("does not leak archived charters into listCharters", async () => {
    const { archiveCharter, listCharters } = await import("../store");
    await seedProject("Ftbot");
    await archiveCharter("project", "ftbot");
    expect(await listCharters()).toEqual([]);
  });
});

describe("listArchivedTasks", () => {
  it("reads the archived tasks file, including done tasks", async () => {
    const { archiveCharter, updateTask, listArchivedTasks } = await import("../store");
    await seedProject("Ftbot");
    await updateTask("project", "ftbot", "T-001", { complete: true });
    await archiveCharter("project", "ftbot");

    const tasks = await listArchivedTasks("project", "ftbot");
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

describe("restoreCharter", () => {
  it("moves the charter and its task directory back, and journals", async () => {
    const { archiveCharter, restoreCharter, listCharters, listTasks } = await import("../store");
    await seedProject("Ftbot");
    await archiveCharter("project", "ftbot");

    const res = await restoreCharter("project", "ftbot");
    expect(res.slug).toBe("ftbot");

    const live = await listCharters();
    expect(live.map((c) => c.id)).toEqual(["ftbot"]);
    expect(await listTasks("project", "ftbot")).toHaveLength(1);
    expect(fsSync.existsSync(path.join(tmp, "archive", "projects", "ftbot.md"))).toBe(false);
    expect(fsSync.existsSync(path.join(tmp, "archive", "projects", "ftbot"))).toBe(false);

    const date = new Date().toLocaleDateString("sv").slice(0, 10);
    const journal = await fs.readFile(path.join(tmp, "journal", `${date}.md`), "utf8");
    expect(journal).toContain("[ftbot] charter restored");
  });

  it("never overwrites a live charter that reclaimed the slug", async () => {
    const { archiveCharter, restoreCharter, getCharter, listCharters } = await import("../store");
    await seedProject("Ftbot", "original mvp");
    await archiveCharter("project", "ftbot");
    await seedProject("Ftbot", "the replacement");

    const res = await restoreCharter("project", "ftbot");
    expect(res.slug).toBe("ftbot-2");

    const survivor = await getCharter("project", "ftbot");
    expect(survivor.mvp).toBe("the replacement");
    const restored = await getCharter("project", "ftbot-2");
    expect(restored.mvp).toBe("original mvp");
    expect((await listCharters()).map((c) => c.id).sort()).toEqual(["ftbot", "ftbot-2"]);
  });

  it("keeps task details attached across archive and restore", async () => {
    const { archiveCharter, restoreCharter } = await import("../store");
    const { writeDetail, readDetail } = await import("../details");
    await seedProject("Ftbot");
    await writeDetail("project", "ftbot", "T-001", "the plan survives");

    await archiveCharter("project", "ftbot");
    expect(
      fsSync.existsSync(path.join(tmp, "archive", "projects", "ftbot", "details", "T-001.md")),
    ).toBe(true);
    expect(await readDetail("project", "ftbot", "T-001")).toBeNull();

    await restoreCharter("project", "ftbot");
    expect(await readDetail("project", "ftbot", "T-001")).toBe("the plan survives\n");
  });

  it("throws for an archived charter that is not there", async () => {
    const { restoreCharter } = await import("../store");
    await expect(restoreCharter("project", "ghost")).rejects.toThrow(/Archived charter not found/);
  });
});
