import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

/**
 * The gap these tools close: creating a habit was reachable only from the
 * /daily page, so asked for a daily tracker the model could only propose a
 * *task* saying to add one by hand. These run the real implementations, not the
 * mocked tool map used in proposals.test.ts.
 */

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-routines-"));
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

describe("routine tools", () => {
  it("hands the model only the last 28 days of the log", async () => {
    const { toolImpls } = await import("../tools");
    const { shiftIso, isoToday } = await import("@/lib/ui/momentum");
    const today = isoToday();
    await fs.mkdir(path.join(tmp, "daily"), { recursive: true });
    await fs.writeFile(path.join(tmp, "daily", "habits.md"), "- H-001 | Walk | goal:1\n");
    await fs.writeFile(
      path.join(tmp, "daily", "log.md"),
      [
        `- ${shiftIso(today, -40)} 09:00 | H-001 | +1`,
        `- ${shiftIso(today, -28)} 09:00 | H-001 | +1`,
        `- ${shiftIso(today, -27)} 09:00 | H-001 | +1`,
        `- ${today} 09:00 | H-001 | +1`,
        "",
      ].join("\n"),
    );
    const data = await toolImpls.getDaily();
    expect(data.logDays).toBe(28);
    expect(data.log.map((e) => e.date)).toEqual([shiftIso(today, -27), today]);
  });

  it("creates a habit that /daily can count", async () => {
    const { toolImpls } = await import("../tools");
    const habit = await toolImpls.createHabit({ name: "Focus blocks", goal: 4, unit: "× 25 min" });

    expect(habit.id).toMatch(/^H-\d{3,}$/);
    expect(habit).toMatchObject({ name: "Focus blocks", goal: 4, unit: "× 25 min" });

    const raw = await fs.readFile(path.join(tmp, "daily", "habits.md"), "utf8");
    expect(raw).toContain("Focus blocks");
    expect(raw).toContain("goal:4");
  });

  it("creates a rhythm counted per week", async () => {
    const { toolImpls } = await import("../tools");
    const rhythm = await toolImpls.createRhythm({ name: "Long walk", per: 2 });

    expect(rhythm.id).toMatch(/^R-\d{3,}$/);
    expect(rhythm.per).toBe(2);
    expect(await fs.readFile(path.join(tmp, "daily", "rhythms.md"), "utf8")).toContain("per:2");
  });

  it("creates a meal with a live servings count", async () => {
    const { toolImpls } = await import("../tools");
    const meal = await toolImpls.createMeal({ name: "Lentil soup", servings: 3 });

    expect(meal.id).toMatch(/^M-\d{3,}$/);
    expect(meal.servings).toBe(3);
  });

  it("mints monotonic ids rather than colliding", async () => {
    const { toolImpls } = await import("../tools");
    const first = await toolImpls.createHabit({ name: "Walk", goal: 1 });
    const second = await toolImpls.createHabit({ name: "Read", goal: 1 });
    expect(second.id).not.toBe(first.id);
  });

  it("refuses a count that cannot be counted", async () => {
    const { toolImpls } = await import("../tools");
    await expect(toolImpls.createHabit({ name: "Walk", goal: 0 })).rejects.toThrow(/positive/);
    await expect(toolImpls.createRhythm({ name: "Laundry", per: 1.5 })).rejects.toThrow(/positive/);
    await expect(toolImpls.createMeal({ name: "Soup", servings: -2 })).rejects.toThrow(/positive/);
  });

  it("refuses a nameless routine", async () => {
    const { toolImpls } = await import("../tools");
    await expect(toolImpls.createHabit({ name: "", goal: 1 })).rejects.toThrow(/name/);
  });

  it("journals the creation, like every other write", async () => {
    const { toolImpls } = await import("../tools");
    await toolImpls.createHabit({ name: "Focus blocks", goal: 4 });
    const days = await fs.readdir(path.join(tmp, "journal"));
    expect(days.length).toBeGreaterThan(0);
  });
});

describe("create_task passthrough", () => {
  it("carries due, est and lane through to the task line", async () => {
    const { toolImpls } = await import("../tools");
    const dir = path.join(tmp, "projects");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "alpha.md"),
      [
        "---",
        "id: alpha",
        'name: "Alpha"',
        "type: project",
        "status: active",
        "priority: 2",
        'mvp: "ship it"',
        "created: 2026-08-01",
        "updated: 2026-08-01",
        "---",
        "",
        "## Why",
        "Fixture.",
        "",
        "## MVP scope",
        "",
        "## Parking lot",
        "",
      ].join("\n"),
    );

    const task = await toolImpls.createTask({
      project: "alpha",
      title: "Ship the exporter",
      size: "M",
      due: "2026-09-04",
      est: "2h",
      lane: "deep",
    });

    expect(task).toMatchObject({ due: "2026-09-04", est: "2h", lane: "deep" });

    const raw = await fs.readFile(path.join(tmp, "projects", "alpha", "tasks.md"), "utf8");
    expect(raw).toContain("due:2026-09-04");
    expect(raw).toContain("est:2h");
    expect(raw).toContain("lane:deep");
  });
});
