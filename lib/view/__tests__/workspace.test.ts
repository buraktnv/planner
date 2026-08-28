import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp: string;

beforeEach(() => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-view-"));
  process.env.PLANNER_DATA_DIR = tmp;
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writeCharter(
  type: "project" | "area",
  slug: string,
  opts: {
    name: string;
    priority?: number;
    status?: string;
    mvp?: string;
    scope?: string[];
    parking?: string[];
  },
) {
  const dir = path.join(tmp, type === "project" ? "projects" : "areas");
  await fs.mkdir(dir, { recursive: true });
  const rows = [
    `id: ${slug}`,
    `name: ${JSON.stringify(opts.name)}`,
    `type: ${type}`,
    `status: ${opts.status ?? "active"}`,
    `priority: ${opts.priority ?? 2}`,
  ];
  if (type === "project") rows.push(`mvp: ${JSON.stringify(opts.mvp ?? "ship it")}`);
  rows.push("created: 2026-08-01", "updated: 2026-08-01");
  const body = [
    "## Why",
    "Because the fixture says so.",
    "",
    "## MVP scope",
    ...(opts.scope ?? []),
    "",
    "## Parking lot",
    ...(opts.parking ?? []),
  ].join("\n");
  await fs.writeFile(path.join(dir, `${slug}.md`), `---\n${rows.join("\n")}\n---\n\n${body}\n`);
}

async function writeTasks(
  type: "project" | "area",
  slug: string,
  sections: { backlog?: string[]; progress?: string[]; done?: string[] },
) {
  const dir = path.join(tmp, type === "project" ? "projects" : "areas", slug);
  await fs.mkdir(dir, { recursive: true });
  const raw = [
    "## Backlog",
    ...(sections.backlog ?? []),
    "",
    "## In progress",
    ...(sections.progress ?? []),
    "",
    "## Done",
    ...(sections.done ?? []),
    "",
  ].join("\n");
  await fs.writeFile(path.join(dir, "tasks.md"), raw);
}

const NOW = new Date(2026, 7, 28);

describe("loadWorkspace", () => {
  it("returns an empty workspace when the data dir has nothing", async () => {
    const { loadWorkspace } = await import("../workspace");
    const ws = await loadWorkspace(NOW);
    expect(ws.charters).toEqual([]);
    expect(ws.cards).toEqual([]);
    expect(ws.today).toBe("2026-08-28");
  });

  it("splits projects from areas and sorts by priority then name", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "beta", { name: "Beta", priority: 2 });
    await writeCharter("project", "alpha", { name: "Alpha", priority: 1 });
    await writeCharter("area", "health", { name: "Health", priority: 2 });
    const ws = await loadWorkspace(NOW);
    expect(ws.charters.map((c) => c.name)).toEqual(["Alpha", "Beta", "Health"]);
    expect(ws.projects.map((c) => c.id)).toEqual(["alpha", "beta"]);
    expect(ws.areas.map((c) => c.id)).toEqual(["health"]);
    expect(ws.byId.get("project/alpha")?.name).toBe("Alpha");
    expect(ws.byId.get("area/health")?.name).toBe("Health");
  });

  it("rolls subtask completion up into the parent card's percentage", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: [
        "- [ ] T-001 | L | Parent | created:2026-08-01",
        "  - [ ] T-001.1 | S | One | created:2026-08-01",
        "  - [ ] T-001.2 | S | Two | created:2026-08-01",
      ],
      done: ["  - [x] T-001.3 | S | Three | done:2026-08-20"],
    });
    const ws = await loadWorkspace(NOW);
    expect(ws.cards).toHaveLength(1);
    const card = ws.cards[0];
    expect(card.subTotal).toBe(3);
    expect(card.subDone).toBe(1);
    expect(card.pct).toBe(33);
  });

  it("falls back to section-based progress when a card has no subtasks", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: ["- [ ] T-001 | S | Not started | created:2026-08-01"],
      progress: ["- [ ] T-002 | M | Underway | created:2026-08-01"],
      done: ["- [x] T-003 | S | Finished | done:2026-08-20"],
    });
    const ws = await loadWorkspace(NOW);
    const pct = Object.fromEntries(ws.cards.map((c) => [c.id, c.pct]));
    expect(pct).toEqual({ "T-001": 0, "T-002": 50, "T-003": 100 });
  });

  it("marks a card overdue only when its due date is strictly before today", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: [
        "- [ ] T-001 | S | Yesterday | created:2026-08-01 | due:2026-08-27",
        "- [ ] T-002 | S | Today | created:2026-08-01 | due:2026-08-28",
        "- [ ] T-003 | S | Tomorrow | created:2026-08-01 | due:2026-08-29",
      ],
      done: ["- [x] T-004 | S | Late but finished | done:2026-08-27 | due:2026-08-01"],
    });
    const ws = await loadWorkspace(NOW);
    const overdue = Object.fromEntries(ws.cards.map((c) => [c.id, c.overdue]));
    expect(overdue).toEqual({
      "T-001": true,
      "T-002": false,
      "T-003": false,
      "T-004": false,
    });
  });

  it("counts open and done cards and derives the charter percentage", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: ["- [ ] T-001 | S | One | created:2026-08-01"],
      done: [
        "- [x] T-002 | S | Two | done:2026-08-20",
        "- [x] T-003 | S | Three | done:2026-08-21",
      ],
    });
    const [charter] = (await loadWorkspace(NOW)).charters;
    expect(charter.open).toBe(1);
    expect(charter.doneTotal).toBe(2);
    expect(charter.total).toBe(3);
    expect(charter.pct).toBe(67);
  });

  it("takes lastActivity from the newest created or done stamp", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: ["- [ ] T-001 | S | One | created:2026-08-05"],
      done: ["- [x] T-002 | S | Two | done:2026-08-19"],
    });
    const [charter] = (await loadWorkspace(NOW)).charters;
    expect(charter.lastActivity).toBe("2026-08-19");
  });

  it("leaves lastActivity null when nothing carries a date", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    const [charter] = (await loadWorkspace(NOW)).charters;
    expect(charter.lastActivity).toBeNull();
  });

  it("prefers an in-progress card as next, then overdue, then the first open one", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: [
        "- [ ] T-001 | S | Plain open | created:2026-08-01",
        "- [ ] T-002 | S | Overdue | created:2026-08-01 | due:2026-08-01",
      ],
      progress: ["- [ ] T-003 | M | Underway | created:2026-08-01"],
    });
    const [charter] = (await loadWorkspace(NOW)).charters;
    expect(charter.next?.id).toBe("T-003");
  });

  it("falls back to the overdue card when nothing is in progress", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: [
        "- [ ] T-001 | S | Plain open | created:2026-08-01",
        "- [ ] T-002 | S | Overdue | created:2026-08-01 | due:2026-08-01",
      ],
    });
    const [charter] = (await loadWorkspace(NOW)).charters;
    expect(charter.next?.id).toBe("T-002");
  });

  it("leaves next null when everything is done", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      done: ["- [x] T-001 | S | Done | done:2026-08-20"],
    });
    const [charter] = (await loadWorkspace(NOW)).charters;
    expect(charter.next).toBeNull();
    expect(charter.pct).toBe(100);
  });

  it("uses the explicit lane and derives one when absent", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: [
        "- [ ] T-001 | S | Small | created:2026-08-01",
        "- [ ] T-002 | L | Large | created:2026-08-01",
        "- [ ] T-003 | S | Parked | created:2026-08-01 | lane:some",
      ],
    });
    const lanes = Object.fromEntries((await loadWorkspace(NOW)).cards.map((c) => [c.id, c.lane]));
    expect(lanes).toEqual({ "T-001": "quick", "T-002": "deep", "T-003": "some" });
  });

  it("gives a charter a stable colour across loads and exposes it on its cards", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: ["- [ ] T-001 | S | One | created:2026-08-01"],
    });
    const first = await loadWorkspace(NOW);
    const second = await loadWorkspace(NOW);
    expect(first.charters[0].color).toBe(second.charters[0].color);
    expect(first.cards[0].color).toBe(first.charters[0].color);
    expect(first.cards[0].charterName).toBe("Alpha");
  });

  it("keys cards by type, slug and task id, and carries the charter type through", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("area", "health", { name: "Health" });
    await writeTasks("area", "health", {
      backlog: ["- [ ] T-001 | S | Walk | created:2026-08-01"],
    });
    const [card] = (await loadWorkspace(NOW)).cards;
    expect(card.key).toBe("area/health/T-001");
    expect(card.type).toBe("area");
    expect(card.slug).toBe("health");
  });

  it("carries charter body sections and a P-prefixed priority label", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", {
      name: "Alpha",
      priority: 1,
      scope: ["- [ ] First target"],
      parking: ["Some day maybe"],
    });
    const [charter] = (await loadWorkspace(NOW)).charters;
    expect(charter.priorityLabel).toBe("P1");
    expect(charter.mvpScope).toEqual(["- [ ] First target"]);
    expect(charter.parkingLot).toEqual(["Some day maybe"]);
    expect(charter.statusLabel).toBe("ACTIVE");
  });

  it("does not treat subtasks as top-level cards", async () => {
    const { loadWorkspace } = await import("../workspace");
    await writeCharter("project", "alpha", { name: "Alpha" });
    await writeTasks("project", "alpha", {
      backlog: [
        "- [ ] T-001 | L | Parent | created:2026-08-01",
        "  - [ ] T-001.1 | S | Child | created:2026-08-01",
      ],
    });
    const ws = await loadWorkspace(NOW);
    expect(ws.cards.map((c) => c.id)).toEqual(["T-001"]);
    expect(ws.cards[0].subs.map((s) => s.id)).toEqual(["T-001.1"]);
  });
});

describe("loadCharterModel", () => {
  it("returns the matching charter and null for a miss", async () => {
    const { loadCharterModel } = await import("../workspace");
    await writeCharter("area", "health", { name: "Health" });
    expect((await loadCharterModel("area", "health", NOW))?.name).toBe("Health");
    expect(await loadCharterModel("area", "nope", NOW)).toBeNull();
    expect(await loadCharterModel("project", "health", NOW)).toBeNull();
  });
});
