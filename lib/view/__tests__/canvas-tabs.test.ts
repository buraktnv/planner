import { describe, expect, it } from "vitest";
import {
  ALL_TAB,
  activeTabKey,
  applyTabOrder,
  buildCanvasTabs,
  hrefOf,
  modeOf,
  readTabOrder,
  reorderTabs,
  safeCanvasPath,
  tabKeyOf,
  type CanvasTab,
  type TabCharter,
} from "../canvas-tabs";

const CHARTERS: TabCharter[] = [
  { id: "planner", name: "Planner", type: "project", color: "#c98" },
  { id: "acme-bot", name: "Acme-Bot", type: "project", color: "#8bc" },
  { id: "career", name: "Career", type: "area", color: "#9a8" },
];

const keys = (tabs: CanvasTab[]) => tabs.map((t) => t.key);

describe("tabKeyOf / hrefOf", () => {
  it("keys a charter by type and slug", () => {
    expect(tabKeyOf("project", "planner")).toBe("project/planner");
    expect(tabKeyOf("area", "career")).toBe("area/career");
  });

  it("keeps you on the same kind of surface", () => {
    expect(hrefOf("project/planner", "system")).toBe("/canvas/project/planner/system");
    expect(hrefOf("project/planner", "tasks")).toBe("/canvas/project/planner");
  });

  it("sends the global tab to /canvas in either mode", () => {
    expect(hrefOf(ALL_TAB, "system")).toBe("/canvas");
    expect(hrefOf(ALL_TAB, "tasks")).toBe("/canvas");
  });
});

describe("activeTabKey", () => {
  it("resolves each canvas surface", () => {
    expect(activeTabKey("/canvas")).toBe(ALL_TAB);
    expect(activeTabKey("/canvas/project/planner")).toBe("project/planner");
    expect(activeTabKey("/canvas/project/planner/system")).toBe("project/planner");
    expect(activeTabKey("/canvas/area/career/system")).toBe("area/career");
  });

  it("tolerates trailing slashes and unknown paths", () => {
    expect(activeTabKey("/canvas/")).toBe(ALL_TAB);
    expect(activeTabKey("/knowledge/K-001")).toBe(ALL_TAB);
    expect(activeTabKey("/canvas/nonsense/planner")).toBe(ALL_TAB);
    expect(activeTabKey("/canvas/project")).toBe(ALL_TAB);
  });
});

describe("modeOf", () => {
  it("reads the surface kind off the path", () => {
    expect(modeOf("/canvas/project/planner/system")).toBe("system");
    expect(modeOf("/canvas/project/planner")).toBe("tasks");
    expect(modeOf("/canvas/area/career")).toBe("tasks");
  });

  it("treats the global map as system, so tabs do not jump to task maps", () => {
    expect(modeOf("/canvas")).toBe("system");
    expect(modeOf("/anything")).toBe("system");
  });
});

describe("buildCanvasTabs", () => {
  it("puts the global map first, then the charters as given", () => {
    const tabs = buildCanvasTabs(CHARTERS, "system");
    expect(keys(tabs)).toEqual([
      ALL_TAB,
      "project/planner",
      "project/acme-bot",
      "area/career",
    ]);
    expect(tabs[1].label).toBe("Planner");
    expect(tabs[1].color).toBe("#c98");
    expect(tabs[0].color).toBeNull();
  });

  it("builds hrefs for the mode it is given", () => {
    const tabs = buildCanvasTabs(CHARTERS, "tasks");
    expect(tabs[1].href).toBe("/canvas/project/planner");
  });

  it("still yields the global tab with no charters at all", () => {
    expect(keys(buildCanvasTabs([], "system"))).toEqual([ALL_TAB]);
  });
});

describe("applyTabOrder", () => {
  const tabs = buildCanvasTabs(CHARTERS, "system");

  it("uses the stored order", () => {
    const out = applyTabOrder(tabs, ["area/career", "project/planner", ALL_TAB, "project/acme-bot"]);
    expect(keys(out)).toEqual([
      "area/career",
      "project/planner",
      ALL_TAB,
      "project/acme-bot",
    ]);
  });

  it("keeps every tab when the stored order is empty", () => {
    expect(keys(applyTabOrder(tabs, []))).toEqual(keys(tabs));
  });

  it("drops a stored key whose charter is gone", () => {
    const out = applyTabOrder(tabs, ["project/archived-thing", "area/career"]);
    expect(keys(out)).toEqual([
      "area/career",
      ALL_TAB,
      "project/planner",
      "project/acme-bot",
    ]);
  });

  it("appends a charter the stored order has never seen", () => {
    const out = applyTabOrder(tabs, [ALL_TAB, "project/planner"]);
    expect(keys(out)).toEqual([
      ALL_TAB,
      "project/planner",
      "project/acme-bot",
      "area/career",
    ]);
  });

  it("never duplicates a tab, even from a repeated stored key", () => {
    const out = applyTabOrder(tabs, ["project/planner", "project/planner"]);
    expect(keys(out)).toEqual([
      "project/planner",
      ALL_TAB,
      "project/acme-bot",
      "area/career",
    ]);
    expect(new Set(keys(out)).size).toBe(out.length);
  });

  it("returns exactly the input tabs, whatever the stored order says", () => {
    const out = applyTabOrder(tabs, ["nope", "area/career", "also-nope"]);
    expect(out.length).toBe(tabs.length);
    expect(new Set(keys(out))).toEqual(new Set(keys(tabs)));
  });
});

describe("reorderTabs", () => {
  const order = ["all", "a", "b", "c"];

  it("moves a tab later", () => {
    expect(reorderTabs(order, "a", "c")).toEqual(["all", "b", "c", "a"]);
  });

  it("moves a tab earlier", () => {
    expect(reorderTabs(order, "c", "all")).toEqual(["c", "all", "a", "b"]);
  });

  it("is a no-op onto itself", () => {
    expect(reorderTabs(order, "b", "b")).toEqual(order);
  });

  it("is a no-op for a key that is not there", () => {
    expect(reorderTabs(order, "ghost", "a")).toEqual(order);
    expect(reorderTabs(order, "a", "ghost")).toEqual(order);
  });

  it("never mutates the input", () => {
    const input = [...order];
    reorderTabs(input, "a", "c");
    expect(input).toEqual(order);
  });

  it("keeps every key", () => {
    const out = reorderTabs(order, "all", "c");
    expect(new Set(out)).toEqual(new Set(order));
    expect(out.length).toBe(order.length);
  });
});

describe("readTabOrder", () => {
  it("reads a stored array", () => {
    expect(readTabOrder('["a","b"]')).toEqual(["a", "b"]);
  });

  it("returns nothing for junk", () => {
    expect(readTabOrder(null)).toEqual([]);
    expect(readTabOrder(undefined)).toEqual([]);
    expect(readTabOrder("")).toEqual([]);
    expect(readTabOrder("not json")).toEqual([]);
    expect(readTabOrder('{"a":1}')).toEqual([]);
    expect(readTabOrder("42")).toEqual([]);
  });

  it("drops non-strings and duplicates", () => {
    expect(readTabOrder('["a",1,null,"a","b"]')).toEqual(["a", "b"]);
  });
});

describe("safeCanvasPath", () => {
  it("accepts in-app canvas paths", () => {
    expect(safeCanvasPath("/canvas")).toBe("/canvas");
    expect(safeCanvasPath("/canvas/project/planner/system")).toBe(
      "/canvas/project/planner/system",
    );
  });

  it("refuses anything that could leave the app", () => {
    expect(safeCanvasPath("//evil.example")).toBeNull();
    expect(safeCanvasPath("//canvas")).toBeNull();
    expect(safeCanvasPath("https://evil.example/canvas")).toBeNull();
    expect(safeCanvasPath("/canvasfoo")).toBeNull();
    expect(safeCanvasPath("/knowledge")).toBeNull();
    expect(safeCanvasPath("/canvas/a b")).toBeNull();
    expect(safeCanvasPath("/canvas\\evil")).toBeNull();
    expect(safeCanvasPath(null)).toBeNull();
    expect(safeCanvasPath(12)).toBeNull();
  });
});
