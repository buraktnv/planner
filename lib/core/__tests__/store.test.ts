import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

function localDate(): string {
  const now = new Date();
  return now.toLocaleDateString("sv").slice(0, 10);
}

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-store-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

async function gitCommitCount(): Promise<number> {
  const git = simpleGit(tmp);
  const log = await git.log();
  return log.all.length;
}

describe("store CRUD", () => {
  it("createCharter writes a file that parses and journals + commits", async () => {
    const { createCharter, getCharter } = await import("../store");
    const c = await createCharter({
      type: "project",
      name: "My Cool Project",
      why: "because reasons",
      mvp: "ship it",
    });
    expect(c.name).toBe("My Cool Project");
    const file = path.join(tmp, "projects", "my-cool-project.md");
    const raw = await fs.readFile(file, "utf8");
    expect(raw).toContain("name: \"My Cool Project\"");
    const stored = await getCharter("project", "my-cool-project");
    expect(stored.name).toBe("My Cool Project");
    expect(stored.priority).toBe(2);
    expect(stored.created).toBe(localDate());
    expect(stored.mvp).toBe("ship it");
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toContain("[my-cool-project] charter created");
    expect(await gitCommitCount()).toBeGreaterThanOrEqual(1);
  });

  it("getCharter throws when file is missing", async () => {
    const { getCharter } = await import("../store");
    await expect(getCharter("project", "nope")).rejects.toThrow();
  });

  it("addTask appends to Backlog with the next id", async () => {
    const { createCharter, addTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Health", why: "live long" });
    const t1 = await addTask("area", "health", { title: "Exercise", size: "M" });
    expect(t1.id).toBe("T-001");
    const t2 = await addTask("area", "health", { title: "Sleep", size: "S" });
    expect(t2.id).toBe("T-002");
    const tasks = await listTasks("area", "health");
    expect(tasks).toHaveLength(2);
    expect(tasks[0].section).toBe("backlog");
    const raw = await fs.readFile(path.join(tmp, "areas", "health", "tasks.md"), "utf8");
    expect(raw).toContain("- [ ] T-001 | M | Exercise | created:");
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toMatch(/\[health\] T-001 added: Exercise/);
  });

  it("addTask as subtask computes child id and inherits parent section", async () => {
    const { createCharter, addTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Work", why: "money" });
    const parent = await addTask("area", "work", { title: "Project X", size: "L" });
    const child = await addTask("area", "work", { title: "Sub bit", size: "S", parentId: parent.id });
    expect(child.id).toBe("T-001.1");
    expect(child.section).toBe("backlog");
    expect(child.parentId).toBe("T-001");
    const tasks = await listTasks("area", "work");
    expect(tasks.find((t) => t.id === "T-001.1")).toBeDefined();
  });

  it("updateTask with complete moves to Done with done date, journal and commit", async () => {
    const { createCharter, addTask, updateTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Chores", why: "clean" });
    const t = await addTask("area", "chores", { title: "Vacuum", size: "S" });
    const before = await gitCommitCount();
    const updated = await updateTask("area", "chores", t.id, { complete: true });
    expect(updated.done).toBe(true);
    expect(updated.section).toBe("done");
    expect(updated.doneDate).toBe(localDate());
    expect(updated.created).toBeUndefined();
    const tasks = await listTasks("area", "chores");
    expect(tasks[0].section).toBe("done");
    const raw = await fs.readFile(path.join(tmp, "areas", "chores", "tasks.md"), "utf8");
    expect(raw).toContain(`- [x] T-001 | S | Vacuum | done:${localDate()}`);
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toMatch(/\[chores\] T-001 done/);
    expect(await gitCommitCount()).toBeGreaterThan(before);
  });

  it("updateTask moves section when patch.section given", async () => {
    const { createCharter, addTask, updateTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Learn", why: "grow" });
    const t = await addTask("area", "learn", { title: "Read", size: "M" });
    await updateTask("area", "learn", t.id, { section: "in-progress" });
    const tasks = await listTasks("area", "learn");
    expect(tasks[0].section).toBe("in-progress");
  });

  it("listTasks returns [] when tasks.md is missing", async () => {
    const { createCharter, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Empty", why: "nothing yet" });
    const tasks = await listTasks("area", "empty");
    expect(tasks).toEqual([]);
  });

  it("getAbout/saveAbout round-trips", async () => {
    const { saveAbout, getAbout } = await import("../store");
    await saveAbout("# About me\n\nhi");
    const content = await getAbout();
    expect(content).toContain("hi");
    const file = await fs.readFile(path.join(tmp, "about.md"), "utf8");
    expect(file).toContain("hi");
    expect(await gitCommitCount()).toBeGreaterThanOrEqual(1);
  });

  it("createCharter throws for a project without mvp", async () => {
    const { createCharter } = await import("../store");
    await expect(
      createCharter({ type: "project", name: "No Mvp", why: "oops" }),
    ).rejects.toThrow();
    const file = path.join(tmp, "projects", "no-mvp.md");
    await expect(fs.readFile(file, "utf8")).rejects.toThrow();
  });

  it("updateCharter throws when removing mvp from a project", async () => {
    const { createCharter, updateCharter } = await import("../store");
    await createCharter({ type: "project", name: "Has Mvp", why: "y", mvp: "ship" });
    await expect(
      updateCharter("project", "has-mvp", { mvp: undefined }),
    ).rejects.toThrow();
  });

  it("updateTask with complete:false reopens into backlog with created restored and doneDate gone", async () => {
    const { createCharter, addTask, updateTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Reopen", why: "test" });
    const t = await addTask("area", "reopen", { title: "Do it", size: "M" });
    await updateTask("area", "reopen", t.id, { complete: true });
    const reopened = await updateTask("area", "reopen", t.id, { complete: false });
    expect(reopened.done).toBe(false);
    expect(reopened.section).toBe("backlog");
    expect(reopened.created).toBe(localDate());
    expect(reopened.doneDate).toBeUndefined();
    const tasks = await listTasks("area", "reopen");
    const stored = tasks.find((x) => x.id === t.id)!;
    expect(stored.section).toBe("backlog");
    expect(stored.created).toBe(localDate());
    expect(stored.doneDate).toBeUndefined();
  });

  it("addTask subtask under a done parent lands in backlog", async () => {
    const { createCharter, addTask, updateTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Parent", why: "test" });
    const parent = await addTask("area", "parent", { title: "Done parent", size: "M" });
    await updateTask("area", "parent", parent.id, { complete: true });
    const child = await addTask("area", "parent", {
      title: "Child",
      size: "S",
      parentId: parent.id,
    });
    expect(child.section).toBe("backlog");
    const tasks = await listTasks("area", "parent");
    expect(tasks.find((x) => x.id === child.id)!.section).toBe("backlog");
  });
});
