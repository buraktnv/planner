import { describe, expect, it } from "vitest";
import { buildStatusFeed } from "../status-feed";
import { renderStatus } from "@/lib/core/status";
import type { LoggedEntry } from "@/lib/core/comments";
import type { CharterModel } from "../workspace";

const charter = { id: "acme-bot", name: "Acme Bot", color: "#123456", type: "project" } as CharterModel;
// Keyed the way loadWorkspace keys it: `${type}/${slug}`.
const ws = { byId: new Map([["project/acme-bot", charter]]) };

function entry(over: Partial<LoggedEntry> = {}): LoggedEntry {
  return {
    type: "project",
    slug: "acme-bot",
    taskId: "T-001",
    date: "2026-09-06",
    time: "14:22",
    marker: "status",
    body: renderStatus({
      happened: "Chose heading chunks.",
      changed: "Updated K-001; created T-004; reversed G-002.",
      next: "Eval.",
    }),
    ...over,
  };
}

describe("buildStatusFeed", () => {
  it("shapes an entry with charter colour, task link and linked refs", () => {
    const [item] = buildStatusFeed([entry()], ws);
    expect(item.charterName).toBe("Acme Bot");
    expect(item.color).toBe("#123456");
    expect(item.href).toBe("/projects/acme-bot/tasks/T-001");
    expect(item.happened).toBe("Chose heading chunks.");
    expect(item.refs).toEqual([
      { id: "K-001", href: "/knowledge/K-001" },
      { id: "T-004", href: "/projects/acme-bot/tasks/T-004" },
      { id: "G-002", href: null },
    ]);
  });

  it("treats a marked entry without the labels as a plain happened line", () => {
    const [item] = buildStatusFeed([entry({ body: "just text" })], ws);
    expect(item.happened).toBe("just text");
    expect(item.changed).toBe("");
    expect(item.refs).toEqual([]);
  });

  it("falls back to the slug for a charter it does not know, and caps", () => {
    const items = buildStatusFeed(
      [entry({ slug: "gone", type: "area" }), entry(), entry()],
      ws,
      2,
    );
    expect(items).toHaveLength(2);
    expect(items[0].charterName).toBe("gone");
    expect(items[0].href).toBe("/areas/gone/tasks/T-001");
  });
});
