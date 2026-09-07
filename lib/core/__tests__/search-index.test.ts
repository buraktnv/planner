import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SearchItem, SearchKind } from "../types";

let tmp: string;

function isoToday(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

async function put(rel: string, body: string): Promise<void> {
  const file = path.join(tmp, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, "utf8");
}

const NOTE = `---
id: K-001
title: Retry policy
summary: Backoff is capped at thirty seconds.
tags:
  - decision
created: 2026-08-01
updated: 2026-08-02
---

The worker retries with jitter. Needle lives here.
`;

const CHARTER = `---
id: acme-bot
name: Acme Bot
type: project
status: active
priority: 1
mvp: A bot that answers
created: 2026-08-01
updated: 2026-08-05
---

## Why
Because support is drowning.

## MVP scope
- [ ] G-001 | Ship the answerer

## Parking lot
`;

const AREA = `---
id: acme-health
name: Acme Health
type: area
status: active
priority: 2
created: 2026-08-01
updated: 2026-08-05
---

## Why
Bodies need maintenance.

## MVP scope

## Parking lot
`;

const TASKS = `## Backlog
- [ ] T-001 | M | Wire the retry | created:2026-08-03
  - [ ] T-001.1 | S | Add jitter | created:2026-08-03
- [ ] T-002 | S | Write the runbook | created:2026-08-04

## In progress

## Done
`;

const LOG = `# T-001 — log

## 2026-09-01 14:22
First entry.

## 2026-09-02 09:10
Second entry.

## 2026-09-03 11:00
Third entry.
`;

async function seed(): Promise<void> {
  await put("knowledge/K-001-retry-policy.md", NOTE);
  await put("projects/acme-bot.md", CHARTER);
  await put("projects/acme-bot/tasks.md", TASKS);
  await put("projects/acme-bot/details/T-001.md", "The plan for the retry.");
  await put("projects/acme-bot/comments/T-001.md", LOG);
  await put("areas/acme-health.md", AREA);
  await put(
    "areas/acme-health/tasks.md",
    "## Backlog\n- [ ] T-010 | S | Book the check-up | created:2026-08-06\n\n## In progress\n\n## Done\n",
  );
  await put(
    "calendar.md",
    "- [ ] E-001 | 2026-09-10 | Passport appointment | note:bring photos\n",
  );
  await put("daily/habits.md", "- H-001 | Walk | goal:4\n");
  await put("daily/rhythms.md", "- R-001 | Laundry | per:3\n");
  await put("daily/meals.md", "- M-001 | Lentil soup | servings:2\n");
  await put("daily/groceries.md", "- [ ] G-001 | Red lentils | cat:Staples\n");
  await put(`journal/${isoToday()}.md`, `# ${isoToday()}\n\n- 09:00 [acme-bot] charter created\n`);
}

async function fresh() {
  const mod = await import("../search-index");
  mod.invalidateSearchIndex();
  return mod;
}

function countKind(items: SearchItem[], kind: SearchKind): number {
  return items.filter((i) => i.kind === kind).length;
}

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-search-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const mod = await import("../search-index");
  mod.invalidateSearchIndex();
});

afterEach(async () => {
  vi.restoreAllMocks();
  const mod = await import("../search-index");
  mod.invalidateSearchIndex();
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

describe("buildSearchIndex", () => {
  it("produces the expected item per source", async () => {
    await seed();
    const { buildSearchIndex } = await fresh();
    const items = await buildSearchIndex();

    expect(countKind(items, "note")).toBe(1);
    expect(countKind(items, "charter")).toBe(2);
    expect(countKind(items, "task")).toBe(4);
    expect(countKind(items, "description")).toBe(1);
    expect(countKind(items, "log")).toBe(3);
    expect(countKind(items, "event")).toBe(1);
    expect(countKind(items, "habit")).toBe(1);
    expect(countKind(items, "rhythm")).toBe(1);
    expect(countKind(items, "meal")).toBe(1);
    expect(countKind(items, "grocery")).toBe(1);
    expect(countKind(items, "journal")).toBe(1);
    for (const item of items) expect(item.title).not.toBe("");
  });

  it("carries a note's title, summary, tags and body", async () => {
    await seed();
    const { buildSearchIndex } = await fresh();
    const note = (await buildSearchIndex()).find((i) => i.key === "note:K-001");
    expect(note).toBeDefined();
    expect(note?.title).toBe("Retry policy");
    expect(note?.subtitle).toBe("Backoff is capped at thirty seconds.");
    expect(note?.tags).toEqual(["decision"]);
    expect(note?.body).toContain("Needle lives here.");
    expect(note?.updated).toBe("2026-08-02");
  });

  it("gives a subtask its own item with the dotted id", async () => {
    await seed();
    const { buildSearchIndex } = await fresh();
    const sub = (await buildSearchIndex()).find(
      (i) => i.kind === "task" && i.taskId === "T-001.1",
    );
    expect(sub).toBeDefined();
    expect(sub?.title).toBe("Add jitter");
    expect(sub?.type).toBe("project");
    expect(sub?.slug).toBe("acme-bot");
  });

  it("gives a task with a description both rows, with distinct keys", async () => {
    await seed();
    const { buildSearchIndex } = await fresh();
    const items = await buildSearchIndex();
    const rows = items.filter((i) => i.taskId === "T-001" && i.kind !== "log");
    expect(rows.map((r) => r.kind).sort()).toEqual(["description", "task"]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
    expect(rows.find((r) => r.kind === "description")?.body).toBe("The plan for the retry.");
  });

  it("turns three log entries in one file into three items with their own stamps", async () => {
    await seed();
    const { buildSearchIndex } = await fresh();
    const logs = (await buildSearchIndex()).filter((i) => i.kind === "log");
    expect(logs.map((l) => l.updated)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(logs[0].key).toBe("log:project/acme-bot/T-001/2026-09-01 14:22");
    expect(new Set(logs.map((l) => l.key)).size).toBe(3);
  });

  it("builds an empty index from an empty data dir without throwing", async () => {
    const { buildSearchIndex } = await fresh();
    await expect(buildSearchIndex()).resolves.toEqual([]);
  });

  it("drops only the broken charter's tasks when tasks.md will not parse", async () => {
    await seed();
    await put("projects/acme-bot/tasks.md", "## Backlog\n- [ ] T-001 | M | Bad | nonsense:1\n");
    const { buildSearchIndex } = await fresh();
    const items = await buildSearchIndex();

    expect(items.some((i) => i.kind === "task" && i.slug === "acme-bot")).toBe(false);
    // Everything else survives: the charter row, the other charter's tasks,
    // and the notes.
    expect(items.some((i) => i.key === "charter:project/acme-bot")).toBe(true);
    expect(items.some((i) => i.kind === "task" && i.slug === "acme-health")).toBe(true);
    expect(items.some((i) => i.key === "note:K-001")).toBe(true);
    expect(items.some((i) => i.kind === "log")).toBe(true);
  });

  it("truncates a body at BODY_CAP", async () => {
    const long = "x".repeat(9000);
    await put(
      "knowledge/K-002-long.md",
      `---\nid: K-002\ntitle: Long\nsummary: Long note.\ncreated: 2026-08-01\nupdated: 2026-08-01\n---\n\n${long}\n`,
    );
    const { buildSearchIndex } = await fresh();
    const { BODY_CAP } = await import("../tokens");
    const note = (await buildSearchIndex()).find((i) => i.key === "note:K-002");
    expect(note?.body.length).toBe(BODY_CAP);
  });
});

describe("getSearchIndex caching", () => {
  it("returns the same array and builds once inside FRESH_MS", async () => {
    await seed();
    const { getSearchIndex } = await fresh();
    const a = await getSearchIndex();
    const b = await getSearchIndex();
    expect(b).toBe(a);
  });

  it("shares one build across concurrent calls", async () => {
    await seed();
    const { getSearchIndex } = await fresh();
    const [a, b, c] = await Promise.all([
      getSearchIndex(),
      getSearchIndex(),
      getSearchIndex(),
    ]);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("does not rebuild past FRESH_MS when nothing on disk moved", async () => {
    await seed();
    const { getSearchIndex, FRESH_MS } = await fresh();
    const real = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(real);
    const a = await getSearchIndex();
    now.mockReturnValue(real + FRESH_MS + 500);
    expect(await getSearchIndex()).toBe(a);
  });

  it("picks up a journal line appended behind its back once FRESH_MS has passed", async () => {
    await seed();
    const { getSearchIndex, FRESH_MS } = await fresh();
    const real = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(real);
    const a = await getSearchIndex();

    // Not through a writer: this is the separate MCP process, which has its
    // own module scope and cannot invalidate this cache.
    await fs.appendFile(
      path.join(tmp, "journal", `${isoToday()}.md`),
      "- 10:30 [acme-bot] T-003 created\n",
      "utf8",
    );
    now.mockReturnValue(real + FRESH_MS + 500);
    const b = await getSearchIndex();
    expect(b).not.toBe(a);
    expect(b.filter((i) => i.kind === "journal")).toHaveLength(2);
  });

  it("rebuilds past MAX_AGE_MS even when the stamp is unchanged", async () => {
    await seed();
    const { getSearchIndex, MAX_AGE_MS } = await fresh();
    const real = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(real);
    const a = await getSearchIndex();
    now.mockReturnValue(real + MAX_AGE_MS + 1);
    expect(await getSearchIndex()).not.toBe(a);
  });

  it("invalidateSearchIndex forces a rebuild", async () => {
    await seed();
    const mod = await fresh();
    const a = await mod.getSearchIndex();
    mod.invalidateSearchIndex();
    expect(await mod.getSearchIndex()).not.toBe(a);
  });
});
