import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFocus, rankCards } from "../focus";
import type { CardModel, CharterModel, Workspace } from "../workspace";

const TODAY = "2026-08-28";

let tmp: string;

beforeEach(() => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-blocked-"));
  process.env.PLANNER_DATA_DIR = tmp;
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

function card(partial: Partial<CardModel> & { id: string }): CardModel {
  const slug = partial.slug ?? "alpha";
  const type = partial.type ?? "project";
  return {
    key: `${type}/${slug}/${partial.id}`,
    type,
    slug,
    charterName: partial.charterName ?? "Alpha",
    color: "#7d95dd",
    tint: "#e6eaf9",
    title: partial.title ?? `Task ${partial.id}`,
    size: "M",
    lane: "deep",
    section: "backlog",
    done: false,
    blocked: false,
    overdue: false,
    pct: 0,
    subDone: 0,
    subTotal: 0,
    subs: [],
    hasDetail: false,
    priority: "P2",
    ...partial,
  };
}

function charter(id: string, priority: number, cards: CardModel[]): CharterModel {
  return {
    id,
    name: id,
    type: "project",
    status: "active",
    statusLabel: "ACTIVE",
    priority,
    priorityLabel: `P${priority}`,
    why: "",
    mvpScope: [],
    parkingLot: [],
    color: "#7d95dd",
    tint: "#e6eaf9",
    open: cards.filter((c) => !c.done).length,
    doneTotal: cards.filter((c) => c.done).length,
    total: cards.length,
    pct: 0,
    lastActivity: null,
    cards,
    next: null,
  };
}

function workspace(charters: CharterModel[]): Workspace {
  const cards = charters.flatMap((c) => c.cards);
  return {
    charters,
    projects: charters.filter((c) => c.type === "project"),
    areas: charters.filter((c) => c.type === "area"),
    cards,
    byId: new Map(charters.map((c) => [`${c.type}/${c.id}`, c])),
    today: TODAY,
  };
}

describe("focus ranking with blocked cards", () => {
  it("sinks blocked cards below everything else, even overdue ones", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", due: "2026-08-20", overdue: true, blocked: true, waitsOn: "the clinic" }),
        card({ id: "T-002" }),
        card({ id: "T-003", due: "2026-09-05" }),
      ]),
    ]);
    expect(rankCards(ws).map((r) => r.card.id)).toEqual(["T-003", "T-002", "T-001"]);
  });

  it("never picks a blocked card as the One Thing", () => {
    const ws = workspace([
      charter("alpha", 1, [
        card({ id: "T-001", due: "2026-08-20", overdue: true, blocked: true, waitsOn: "T-009" }),
        card({ id: "T-002" }),
      ]),
    ]);
    const focus = buildFocus(ws, []);
    expect(focus.ranked[0].card.id).toBe("T-002");
    expect(focus.oneThing?.card.id).toBe("T-002");
  });

  it("leaves the One Thing null when every open card is blocked", () => {
    const ws = workspace([
      charter("alpha", 1, [card({ id: "T-001", blocked: true, waitsOn: "the clinic" })]),
    ]);
    expect(buildFocus(ws, []).oneThing).toBeNull();
  });

  it("never pins a blocked card", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", due: "2026-08-20", overdue: true, blocked: true, waitsOn: "T-009" }),
      ]),
    ]);
    expect(rankCards(ws)[0].pinned).toBe(false);
  });

  it("does not offer a blocked small task as the stuck escape hatch", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", size: "S", blocked: true, waitsOn: "the clinic" }),
        card({ id: "T-002", size: "S", title: "Free small one" }),
      ]),
    ]);
    const offers = buildFocus(ws, []).stuckOffers.filter((o) => o.kind === "small");
    expect(offers).toHaveLength(1);
    expect(offers[0].cardKey).toBe("project/alpha/T-002");
  });

  it("explains the block as the reason", () => {
    const byTitle = workspace([
      charter("alpha", 2, [
        card({ id: "T-002", blocked: true, waitsOn: "T-001", blockedByTitle: "Gather the papers" }),
      ]),
    ]);
    expect(rankCards(byTitle)[0].why).toBe("Waits on Gather the papers");

    const byText = workspace([
      charter("alpha", 2, [card({ id: "T-003", blocked: true, waitsOn: "the clinic" })]),
    ]);
    expect(rankCards(byText)[0].why).toBe("Waits on the clinic");
  });
});

async function writeFixture(tasks: string[]) {
  const dir = path.join(tmp, "projects");
  await fs.mkdir(path.join(dir, "alpha"), { recursive: true });
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
      "Because the fixture says so.",
      "",
      "## MVP scope",
      "",
      "## Parking lot",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(dir, "alpha", "tasks.md"), tasks.join("\n"), "utf8");
}

describe("workspace card model", () => {
  it("marks a card blocked by an open task and names the blocker", async () => {
    await writeFixture([
      "## Backlog",
      "- [ ] T-001 | M | Gather the papers | created:2026-08-27",
      "- [ ] T-002 | S | Send the forms | created:2026-08-27 | waits:T-001",
      "",
      "## In progress",
      "",
      "## Done",
      "",
    ]);
    const { loadWorkspace } = await import("../workspace");
    const ws = await loadWorkspace(new Date(2026, 7, 28));
    const waiter = ws.cards.find((c) => c.id === "T-002");
    expect(waiter?.waitsOn).toBe("T-001");
    expect(waiter?.blocked).toBe(true);
    expect(waiter?.blockedByTitle).toBe("Gather the papers");
    expect(ws.cards.find((c) => c.id === "T-001")?.blocked).toBe(false);
  });

  it("unblocks a card once its blocker is done", async () => {
    await writeFixture([
      "## Backlog",
      "- [ ] T-002 | S | Send the forms | created:2026-08-27 | waits:T-001",
      "",
      "## In progress",
      "",
      "## Done",
      "- [x] T-001 | M | Gather the papers | done:2026-08-28",
      "",
    ]);
    const { loadWorkspace } = await import("../workspace");
    const ws = await loadWorkspace(new Date(2026, 7, 28));
    const waiter = ws.cards.find((c) => c.id === "T-002");
    expect(waiter?.blocked).toBe(false);
    expect(waiter?.blockedByTitle).toBe("Gather the papers");
  });

  it("treats free text and unknown ids as blocked", async () => {
    await writeFixture([
      "## Backlog",
      "- [ ] T-001 | S | Book the follow-up | created:2026-08-27 | waits:the clinic",
      "- [ ] T-002 | S | Chase the invoice | created:2026-08-27 | waits:T-404",
      "",
      "## In progress",
      "",
      "## Done",
      "",
    ]);
    const { loadWorkspace } = await import("../workspace");
    const ws = await loadWorkspace(new Date(2026, 7, 28));
    expect(ws.cards.find((c) => c.id === "T-001")?.blocked).toBe(true);
    expect(ws.cards.find((c) => c.id === "T-001")?.blockedByTitle).toBeUndefined();
    expect(ws.cards.find((c) => c.id === "T-002")?.blocked).toBe(true);
  });

  it("does not force the wait lane on a blocked card", async () => {
    await writeFixture([
      "## Backlog",
      "- [ ] T-001 | S | Book the follow-up | created:2026-08-27 | lane:some | waits:the clinic",
      "- [ ] T-002 | M | Chase the invoice | created:2026-08-27 | waits:the clinic",
      "",
      "## In progress",
      "",
      "## Done",
      "",
    ]);
    const { loadWorkspace } = await import("../workspace");
    const ws = await loadWorkspace(new Date(2026, 7, 28));
    expect(ws.cards.find((c) => c.id === "T-001")?.lane).toBe("some");
    expect(ws.cards.find((c) => c.id === "T-002")?.lane).toBe("deep");
  });
});
