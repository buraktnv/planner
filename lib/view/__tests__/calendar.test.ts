import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CalendarEvent } from "@/lib/core/types";

let tmp: string;

beforeEach(() => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-calview-"));
  process.env.PLANNER_DATA_DIR = tmp;
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

async function writeCharter(type: "project" | "area", slug: string, name: string) {
  const dir = path.join(tmp, type === "project" ? "projects" : "areas");
  await fs.mkdir(dir, { recursive: true });
  const rows = [
    `id: ${slug}`,
    `name: ${JSON.stringify(name)}`,
    `type: ${type}`,
    "status: active",
    "priority: 2",
  ];
  if (type === "project") rows.push('mvp: "ship it"');
  rows.push("created: 2026-08-01", "updated: 2026-08-01");
  const body = ["## Why", "Because the fixture says so.", "", "## MVP scope", "", "## Parking lot"].join(
    "\n",
  );
  await fs.writeFile(path.join(dir, `${slug}.md`), `---\n${rows.join("\n")}\n---\n\n${body}\n`);
}

async function writeTasks(type: "project" | "area", slug: string, backlog: string[]) {
  const dir = path.join(tmp, type === "project" ? "projects" : "areas", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "tasks.md"),
    ["## Backlog", ...backlog, "", "## In progress", "", "## Done", ""].join("\n"),
  );
}

const NOW = new Date(2026, 7, 28);

const EVENTS: CalendarEvent[] = [
  {
    id: "E-001",
    date: "2026-08-28",
    title: "Passport appointment",
    done: false,
    time: "09:40",
    note: "bring photos",
    scope: "area:admin",
    action: "photos not printed",
  },
  { id: "E-002", date: "2026-08-26", title: "Missed the call", done: false },
  { id: "E-003", date: "2026-08-30", title: "Kickoff", done: false, scope: "alpha" },
  { id: "E-004", date: "2026-08-30", title: "Already done", done: true },
  { id: "E-005", date: "2026-09-20", title: "Far away", done: false },
];

describe("buildCalendar", () => {
  it("merges events and dated tasks into the three-week grid", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { buildCalendar } = await import("../calendar");
    await writeCharter("project", "alpha", "Alpha");
    await writeCharter("area", "admin", "Admin");
    await writeTasks("project", "alpha", [
      "- [ ] T-001 | S | Dated today | created:2026-08-01 | due:2026-08-28",
      "- [ ] T-002 | M | Past its date | created:2026-08-01 | due:2026-08-20",
      "- [ ] T-003 | M | No date | created:2026-08-01",
    ]);
    const ws = await loadWorkspace(NOW);
    const model = buildCalendar(ws, EVENTS);

    expect(model.today).toBe("2026-08-28");
    expect(model.rows).toHaveLength(3);
    expect(model.rows[0][0].iso).toBe("2026-08-24");
    expect(model.rows[2][6].iso).toBe("2026-09-13");

    const today = model.rows.flat().find((d) => d.iso === "2026-08-28");
    expect(today?.isToday).toBe(true);
    expect(today?.events.map((e) => e.id)).toEqual(["E-001"]);
    expect(today?.cards.map((c) => c.id)).toEqual(["T-001"]);
    expect(today?.dots.map((d) => d.kind)).toEqual(["event", "task"]);

    const kickoff = model.rows.flat().find((d) => d.iso === "2026-08-30");
    expect(kickoff?.events.map((e) => e.id)).toEqual(["E-003"]);
    expect(model.eventCount).toBe(4);
    expect(model.datedCount).toBe(2);
  });

  it("colours events by their scope charter and falls back when unscoped", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { buildCalendar } = await import("../calendar");
    const { hueOf } = await import("@/lib/ui/momentum");
    await writeCharter("area", "admin", "Admin");
    const ws = await loadWorkspace(NOW);
    const model = buildCalendar(ws, EVENTS);
    const scoped = model.needsAction[0];
    expect(scoped.id).toBe("E-001");
    expect(scoped.charterName).toBe("Admin");
    expect(scoped.scopeType).toBe("area");
    expect(scoped.scopeSlug).toBe("admin");
    expect(scoped.color).toBe(hueOf("admin").color);
    const unscoped = model.pastEvents[0];
    expect(unscoped.id).toBe("E-002");
    expect(unscoped.charterName).toBeUndefined();
  });

  it("lists open events with an action under needsAction", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { buildCalendar } = await import("../calendar");
    const ws = await loadWorkspace(NOW);
    const model = buildCalendar(ws, [
      ...EVENTS,
      { id: "E-006", date: "2026-09-01", title: "Done with action", done: true, action: "nope" },
    ]);
    expect(model.needsAction.map((e) => e.id)).toEqual(["E-001"]);
  });

  it("builds Up next from the next 14 days only, skipping empty days", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { buildCalendar } = await import("../calendar");
    await writeCharter("project", "alpha", "Alpha");
    await writeTasks("project", "alpha", [
      "- [ ] T-001 | S | Dated soon | created:2026-08-01 | due:2026-09-02",
      "- [ ] T-002 | M | Past its date | created:2026-08-01 | due:2026-08-20",
    ]);
    const ws = await loadWorkspace(NOW);
    const model = buildCalendar(ws, EVENTS);
    expect(model.upNext.map((d) => d.iso)).toEqual(["2026-08-28", "2026-08-30", "2026-09-02"]);
    expect(model.upNext[2].cards.map((c) => c.id)).toEqual(["T-001"]);
    expect(model.pastEvents.map((e) => e.id)).toEqual(["E-002"]);
    expect(model.overdueCards.map((c) => c.id)).toEqual(["T-002"]);
    expect(model.overdueCount).toBe(2);
  });
});

describe("buildCalendar with repeating and lead events", () => {
  const REPEATING: CalendarEvent[] = [
    { id: "E-020", date: "1990-08-30", title: "Birthday", done: false, repeat: "yearly", lead: 7 },
    { id: "E-021", date: "2026-08-03", title: "Standup", done: false, repeat: "weekly" },
    { id: "E-022", date: "2026-09-17", title: "Passport", done: false, action: "photoshoot", lead: 21 },
    { id: "E-023", date: "2026-09-30", title: "Far", done: false, action: "book seats", lead: 7 },
    { id: "E-024", date: "2026-08-10", title: "Old monthly", done: false, repeat: "monthly" },
  ];

  it("resolves each event to its next occurrence and never marks a repeat as past", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { toEventModels } = await import("../calendar");
    const ws = await loadWorkspace(NOW);
    const models = toEventModels(REPEATING, ws);
    const by = (id: string) => models.find((m) => m.id === id)!;
    expect(by("E-020").occurs).toBe("2026-08-30");
    expect(by("E-020").past).toBe(false);
    expect(by("E-020").daysUntil).toBe(2);
    expect(by("E-020").surfaced).toBe(true);
    expect(by("E-021").occurs).toBe("2026-08-31");
    expect(by("E-024").occurs).toBe("2026-09-10");
    expect(by("E-022").surfaceFrom).toBe("2026-08-27");
    expect(by("E-022").surfaced).toBe(true);
    expect(by("E-023").surfaced).toBe(false);
  });

  it("places a weekly event on every grid day it occurs", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { buildCalendar } = await import("../calendar");
    const ws = await loadWorkspace(NOW);
    const model = buildCalendar(ws, REPEATING);
    const standupDays = model.rows
      .flat()
      .filter((d) => d.events.some((e) => e.id === "E-021"))
      .map((d) => d.iso);
    expect(standupDays).toEqual(["2026-08-24", "2026-08-31", "2026-09-07"]);
    expect(model.pastEvents).toEqual([]);
  });

  it("gates needsAction on the lead window and lists comingUp nearest first", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { buildCalendar } = await import("../calendar");
    const ws = await loadWorkspace(NOW);
    const model = buildCalendar(ws, [...EVENTS, ...REPEATING]);
    expect(model.needsAction.map((e) => e.id)).toEqual(["E-001", "E-022"]);
    expect(model.comingUp.map((e) => e.id)).toEqual(["E-020", "E-022"]);
  });
});

describe("buildFocus with events", () => {
  it("picks a birthday by its occurrence and surfaces lead events under comingUp", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { toEventModels } = await import("../calendar");
    const { buildFocus } = await import("../focus");
    const ws = await loadWorkspace(NOW);
    const events: CalendarEvent[] = [
      { id: "E-030", date: "1990-08-28", title: "Birthday", done: false, repeat: "yearly" },
      { id: "E-031", date: "2026-09-10", title: "Soon", done: false, lead: 14 },
      { id: "E-032", date: "2026-09-05", title: "Sooner", done: false, lead: 14 },
      { id: "E-033", date: "2026-09-20", title: "Not yet", done: false, lead: 7 },
      { id: "E-034", date: "2026-09-02", title: "No lead", done: false },
    ];
    const model = buildFocus(ws, [], toEventModels(events, ws));
    expect(model.todayEvents.map((e) => e.id)).toEqual(["E-030"]);
    expect(model.comingUp.map((e) => e.id)).toEqual(["E-032", "E-031"]);
  });

  it("keeps only today's open events in the strip, ordered by time", async () => {
    const { loadWorkspace } = await import("../workspace");
    const { toEventModels } = await import("../calendar");
    const { buildFocus } = await import("../focus");
    const ws = await loadWorkspace(NOW);
    const events: CalendarEvent[] = [
      { id: "E-010", date: "2026-08-28", title: "Second", done: false, time: "14:00" },
      { id: "E-011", date: "2026-08-28", title: "First", done: false, time: "08:00" },
      { id: "E-012", date: "2026-08-28", title: "Ticked off", done: true },
      { id: "E-013", date: "2026-08-29", title: "Tomorrow", done: false },
    ];
    const model = buildFocus(ws, [], toEventModels(events, ws));
    expect(model.todayEvents.map((e) => e.title)).toEqual(["First", "Second"]);
  });
});
