import { describe, expect, it } from "vitest";
import type { CardModel, SubModel } from "../workspace";
import {
  backLabelFor,
  buildTaskPage,
  charterHref,
  findSub,
  isInternalHref,
  parentIdOf,
  rootIdOf,
  safeBackPath,
  taskHref,
  taskHrefFromScope,
  taskIdsOf,
} from "../task";

function sub(id: string, subs: SubModel[] = []): SubModel {
  return {
    id,
    title: `Sub ${id}`,
    done: false,
    size: "S",
    section: "backlog",
    hasDetail: false,
    subs,
  };
}

function card(id: string, subs: SubModel[] = []): CardModel {
  return {
    key: `project/demo/${id}`,
    type: "project",
    slug: "demo",
    charterName: "Demo",
    color: "#000",
    tint: "#eee",
    id,
    title: `Task ${id}`,
    size: "M",
    lane: "deep",
    section: "backlog",
    done: false,
    blocked: false,
    hasDetail: false,
    overdue: false,
    pct: 0,
    subDone: 0,
    subTotal: subs.length,
    subs,
    priority: "P2",
  };
}

describe("id helpers", () => {
  it("finds the root id of a nested subtask", () => {
    expect(rootIdOf("T-003")).toBe("T-003");
    expect(rootIdOf("T-003.1")).toBe("T-003");
    expect(rootIdOf("T-003.1.2")).toBe("T-003");
  });

  it("finds the immediate parent", () => {
    expect(parentIdOf("T-003")).toBeNull();
    expect(parentIdOf("T-003.1")).toBe("T-003");
    expect(parentIdOf("T-003.1.2")).toBe("T-003.1");
  });
});

describe("hrefs", () => {
  it("routes projects and areas to their own trees", () => {
    expect(taskHref("project", "demo", "T-001")).toBe("/projects/demo/tasks/T-001");
    expect(taskHref("area", "admin", "T-001.2")).toBe("/areas/admin/tasks/T-001.2");
    expect(charterHref("area", "admin")).toBe("/areas/admin");
  });

  it("reads the AI layer's scope string, area prefix included", () => {
    expect(taskHrefFromScope("demo", "T-001")).toBe("/projects/demo/tasks/T-001");
    expect(taskHrefFromScope("area:admin", "T-001")).toBe("/areas/admin/tasks/T-001");
  });

  it("appends an encoded from only when one is given", () => {
    expect(taskHrefFromScope("demo", "T-001", "/board")).toBe(
      "/projects/demo/tasks/T-001?from=%2Fboard",
    );
    expect(taskHrefFromScope("demo", "T-001", null)).toBe("/projects/demo/tasks/T-001");
  });
});

describe("findSub", () => {
  it("reaches an arbitrarily deep subtask", () => {
    const subs = [sub("T-001.1", [sub("T-001.1.1")])];
    expect(findSub(subs, "T-001.1.1")?.id).toBe("T-001.1.1");
    expect(findSub(subs, "T-001.9")).toBeNull();
  });
});

describe("buildTaskPage", () => {
  const cards = [card("T-001", [sub("T-001.1", [sub("T-001.1.1")])]), card("T-002")];

  it("resolves a root task with no parent link", () => {
    const model = buildTaskPage(cards, "project", "demo", "T-001");
    expect(model?.node.isRoot).toBe(true);
    expect(model?.node.title).toBe("Task T-001");
    expect(model?.parentHref).toBeNull();
  });

  it("resolves a subtask through the root id in its own id", () => {
    const model = buildTaskPage(cards, "project", "demo", "T-001.1");
    expect(model?.node.isRoot).toBe(false);
    expect(model?.node.id).toBe("T-001.1");
    expect(model?.card.id).toBe("T-001");
    expect(model?.parentHref).toBe("/projects/demo/tasks/T-001");
  });

  it("links a nested subtask back to its immediate parent, not the root", () => {
    expect(buildTaskPage(cards, "project", "demo", "T-001.1.1")?.parentHref).toBe(
      "/projects/demo/tasks/T-001.1",
    );
  });

  it("returns null for an unknown task, charter or type", () => {
    expect(buildTaskPage(cards, "project", "demo", "T-404")).toBeNull();
    expect(buildTaskPage(cards, "project", "demo", "T-001.9")).toBeNull();
    expect(buildTaskPage(cards, "project", "other", "T-001")).toBeNull();
    expect(buildTaskPage(cards, "area", "demo", "T-001")).toBeNull();
  });
});

describe("taskIdsOf", () => {
  const cards = [card("T-001", [sub("T-001.1", [sub("T-001.1.1")])]), card("T-002")];

  it("lists branches and every leaf beneath them", () => {
    expect(taskIdsOf(cards, "project", "demo")).toEqual([
      "T-001",
      "T-001.1",
      "T-001.1.1",
      "T-002",
    ]);
  });

  it("is scoped to one charter", () => {
    expect(taskIdsOf(cards, "area", "demo")).toEqual([]);
    expect(taskIdsOf(cards, "project", "other")).toEqual([]);
  });
});

describe("safeBackPath", () => {
  it("keeps an in-app path", () => {
    expect(safeBackPath("/board")).toBe("/board");
    expect(safeBackPath("/projects/demo?x=1")).toBe("/projects/demo?x=1");
  });

  it("refuses anything that could leave the app", () => {
    expect(safeBackPath("https://evil.test")).toBeNull();
    expect(safeBackPath("//evil.test")).toBeNull();
    expect(safeBackPath("javascript:alert(1)")).toBeNull();
    expect(safeBackPath("")).toBeNull();
    expect(safeBackPath(null)).toBeNull();
  });
});

describe("isInternalHref", () => {
  it("accepts an in-app path", () => {
    expect(isInternalHref("/projects/demo/tasks/T-001")).toBe(true);
    expect(isInternalHref("/knowledge/K-001")).toBe(true);
  });

  it("rejects anything that leaves the app", () => {
    expect(isInternalHref("https://example.com")).toBe(false);
    expect(isInternalHref("//example.com")).toBe(false);
    expect(isInternalHref("mailto:a@b.c")).toBe(false);
    expect(isInternalHref("#anchor")).toBe(false);
    expect(isInternalHref(undefined)).toBe(false);
  });
});

describe("backLabelFor", () => {
  it("names the page that was left", () => {
    expect(backLabelFor("/", "Demo")).toBe("Focus");
    expect(backLabelFor("/board", "Demo")).toBe("Board");
    expect(backLabelFor("/done?all=1", "Demo")).toBe("Done");
  });

  it("falls back to the charter name for its own pages and for anything unknown", () => {
    expect(backLabelFor("/projects/demo", "Demo")).toBe("Demo");
    expect(backLabelFor(null, "Demo")).toBe("Demo");
    expect(backLabelFor("/somewhere-new", "Demo")).toBe("Demo");
  });

  it("does not match a prefix that is only a word fragment", () => {
    expect(backLabelFor("/boardgames", "Demo")).toBe("Demo");
  });
});
