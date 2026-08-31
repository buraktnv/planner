import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import simpleGit from "simple-git";

/**
 * The web app and the MCP server are separate processes writing the same
 * markdown, and every writer reads the file, mints an id and rewrites the
 * WHOLE file. Before these writes took the lock, two of them interleaving did
 * not merely collide on an id — the second write clobbered the first, so a
 * task the user had just created vanished with no error anywhere.
 *
 * These tests race real writers against each other. They are the only place
 * that failure is visible: every single-writer test passes either way.
 */

let dir: string;
let prev: string | undefined;

beforeEach(async () => {
  prev = process.env.PLANNER_DATA_DIR;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-race-"));
  process.env.PLANNER_DATA_DIR = dir;
  await fs.mkdir(path.join(dir, "projects"), { recursive: true });
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await fs.writeFile(
    path.join(dir, "projects", "acme-bot.md"),
    [
      "---",
      "id: acme-bot",
      "name: Acme Bot",
      "type: project",
      "status: active",
      "priority: 1",
      "mvp: Ship it",
      "created: 2026-08-01",
      "updated: 2026-08-01",
      "---",
      "",
      "## Why",
      "",
      "Fixture.",
      "",
      "## MVP scope",
      "",
      "## Parking lot",
      "",
    ].join("\n"),
    "utf8",
  );
  await git.add("-A");
  await git.commit("seed");
});

afterEach(async () => {
  if (prev === undefined) delete process.env.PLANNER_DATA_DIR;
  else process.env.PLANNER_DATA_DIR = prev;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("concurrent task writes", () => {
  it("keeps every task when two are added at once", async () => {
    const { addTask, listTasks } = await import("../store");

    await Promise.all([
      addTask("project", "acme-bot", { title: "First", size: "S" }),
      addTask("project", "acme-bot", { title: "Second", size: "M" }),
    ]);

    const tasks = await listTasks("project", "acme-bot");
    expect(tasks.map((t) => t.title).sort()).toEqual(["First", "Second"]);
  });

  it("mints a distinct id for every writer in a burst", async () => {
    const { addTask, listTasks } = await import("../store");

    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        addTask("project", "acme-bot", { title: `Task ${i}`, size: "S" }),
      ),
    );

    const tasks = await listTasks("project", "acme-bot");
    expect(tasks).toHaveLength(6);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(6);
  });

  /** Two writers hitting `git commit` at once used to race on index.lock. */
  it("does not let concurrent commits fail each other", async () => {
    const { addTask } = await import("../store");

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        addTask("project", "acme-bot", { title: `Commit ${i}`, size: "S" }),
      ),
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("keeps every habit when two are added at once", async () => {
    const { addHabit, getDaily } = await import("../daily");

    await Promise.all([addHabit("Walk", 4), addHabit("Read", 2)]);

    const daily = await getDaily();
    expect(daily.habits.map((h) => h.name).sort()).toEqual(["Read", "Walk"]);
    expect(new Set(daily.habits.map((h) => h.id)).size).toBe(2);
  });

  it("keeps every event when two are added at once", async () => {
    const { addEvent, listEvents } = await import("../calendar");

    await Promise.all([
      addEvent({ date: "2026-09-01", title: "Dentist" }),
      addEvent({ date: "2026-09-02", title: "Passport" }),
    ]);

    const events = await listEvents();
    expect(events.map((e) => e.title).sort()).toEqual(["Dentist", "Passport"]);
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });
});

describe("a task title can never break the file it is written into", () => {
  it("refuses a title containing the field delimiter", async () => {
    const { addTask, listTasks } = await import("../store");

    await expect(
      addTask("project", "acme-bot", { title: "Buy milk | eggs", size: "S" }),
    ).rejects.toThrow(/may not contain/);

    expect(await listTasks("project", "acme-bot")).toEqual([]);
  });

  it("refuses to rename a task into a delimiter", async () => {
    const { addTask, updateTask, listTasks } = await import("../store");

    const task = await addTask("project", "acme-bot", { title: "Fine", size: "S" });
    await expect(
      updateTask("project", "acme-bot", task.id, { title: "Broken | title" }),
    ).rejects.toThrow(/may not contain/);

    const tasks = await listTasks("project", "acme-bot");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Fine");
  });

  it("refuses an empty title rather than writing an unparseable line", async () => {
    const { addTask } = await import("../store");
    await expect(
      addTask("project", "acme-bot", { title: "   ", size: "S" }),
    ).rejects.toThrow(/requires a title/);
  });

  /**
   * The whole point: one bad title used to make EVERY task in the charter
   * unreadable, because serializeTasks rewrites the entire file.
   */
  it("leaves existing tasks readable after a rejected write", async () => {
    const { addTask, listTasks } = await import("../store");

    await addTask("project", "acme-bot", { title: "Keep me", size: "S" });
    await expect(
      addTask("project", "acme-bot", { title: "a | b", size: "S" }),
    ).rejects.toThrow();

    const tasks = await listTasks("project", "acme-bot");
    expect(tasks.map((t) => t.title)).toEqual(["Keep me"]);
  });
});
