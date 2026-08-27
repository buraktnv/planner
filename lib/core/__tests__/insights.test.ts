import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import type { Charter, Task } from "../types";
import { serializeCharter, serializeTasks } from "../schema";
import { getInsights } from "../insights";

let tmp: string;

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function mondayOf(d: Date): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - diff);
  return isoLocal(c);
}

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-insights-"));
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

async function writeCharter(c: Charter): Promise<void> {
  const dir = c.type === "project" ? path.join(tmp, "projects") : path.join(tmp, "areas");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${c.id}.md`), serializeCharter(c), "utf8");
}

async function writeTasks(type: "project" | "area", slug: string, tasks: Task[]): Promise<void> {
  const dir = type === "project" ? path.join(tmp, "projects", slug) : path.join(tmp, "areas", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "tasks.md"), serializeTasks(tasks), "utf8");
}

function baseCharter(p: Partial<Charter> & Pick<Charter, "id" | "name" | "type" | "status">): Charter {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    priority: 2,
    mvp: p.type === "project" ? "mvp" : undefined,
    repo: undefined,
    created: p.created ?? "2026-01-01",
    updated: p.updated ?? "2026-01-01",
    why: "why",
    mvpScope: [],
    parkingLot: [],
  };
}

describe("getInsights", () => {
  it("computes weeks, stalled, balance deterministically", async () => {
    const now = new Date(2026, 7, 27); // 2026-08-27 (fixed)
    const nowIso = isoLocal(now);

    // A: active project, recent activity (not stalled)
    await writeCharter(baseCharter({ id: "busy", name: "Busy", type: "project", status: "active", created: "2026-06-01" }));
    await writeTasks("project", "busy", [
      { id: "T-001", title: "Done recent", size: "M", done: true, section: "done", doneDate: isoLocal(addDays(now, -3)), parentId: null },
      { id: "T-002", title: "Open recent", size: "M", done: false, section: "backlog", created: isoLocal(addDays(now, -2)), parentId: null },
    ]);

    // B: active project, NO tasks at all → stalled (null lastActivity)
    await writeCharter(baseCharter({ id: "idle", name: "Idle", type: "project", status: "active", created: "2026-08-01" }));

    // C: paused project, old done task → not stalled (status)
    await writeCharter(baseCharter({ id: "paused", name: "Paused", type: "project", status: "paused", created: "2026-01-01" }));
    await writeTasks("project", "paused", [
      { id: "T-001", title: "Old done", size: "M", done: true, section: "done", doneDate: isoLocal(addDays(now, -40)), parentId: null },
    ]);

    // D: active area, recent done → not stalled, counts in balance.areas
    await writeCharter(baseCharter({ id: "health", name: "Health", type: "area", status: "active", created: "2026-06-01" }));
    await writeTasks("area", "health", [
      { id: "T-001", title: "Area done", size: "S", done: true, section: "done", doneDate: isoLocal(addDays(now, -5)), parentId: null },
    ]);

    const insights = await getInsights(now);

    // weeks: 8 buckets, oldest..newest
    expect(insights.weeks).toHaveLength(8);
    const recentDoneWeek = mondayOf(addDays(now, -3));
    const recentCreatedWeek = mondayOf(addDays(now, -2));
    const wd = insights.weeks.find((w) => w.weekStart === recentDoneWeek)!;
    const wc = insights.weeks.find((w) => w.weekStart === recentCreatedWeek)!;
    expect(wd.done).toBe(1);
    expect(wc.created).toBe(1);
    // total done in window: busy(1) + health(1) + paused old(1, within 8w) = 3
    const totalDone = insights.weeks.reduce((s, w) => s + w.done, 0);
    expect(totalDone).toBe(3);

    // perProject
    const busy = insights.perProject.find((p) => p.slug === "busy")!;
    expect(busy.open).toBe(1);
    expect(busy.doneTotal).toBe(1);
    expect(busy.lastActivity).toBe(isoLocal(addDays(now, -2)));
    const idle = insights.perProject.find((p) => p.slug === "idle")!;
    expect(idle.open).toBe(0);
    expect(idle.doneTotal).toBe(0);
    expect(idle.lastActivity).toBeNull();

    // stalled: only the idle active project
    expect(insights.stalled).toHaveLength(1);
    expect(insights.stalled[0].slug).toBe("idle");
    expect(insights.stalled[0].days).toBe(Math.floor((now.getTime() - new Date(2026, 7, 1).getTime()) / 86400000));

    // balance: last 30 days, project=1 (busy) area=1 (health)
    expect(insights.balance).toEqual({ projects: 1, areas: 1 });
    void nowIso;
  });
});
