import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-mentions-"));
  process.env.PLANNER_DATA_DIR = tmp;
  await fs.mkdir(path.join(tmp, "projects", "acme-bot", "details"), { recursive: true });
  await fs.mkdir(path.join(tmp, "projects", "acme-bot", "comments"), { recursive: true });
  await fs.mkdir(path.join(tmp, "areas"), { recursive: true });
  await fs.mkdir(path.join(tmp, "knowledge"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "projects", "acme-bot.md"),
    [
      "---",
      "id: acme-bot",
      'name: "Acme Bot"',
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
      "- [ ] G-001 | First light",
      "",
      "## Parking lot",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(tmp, "projects", "acme-bot", "tasks.md"),
    [
      "## Backlog",
      "- [ ] T-001 | M | Wire the laptop | created:2026-08-01 | due:2026-09-30",
      "  - [ ] T-001.1 | S | Install the client | created:2026-08-01",
      "- [ ] T-002 | S | Plain task | created:2026-08-01",
      "",
      "## In progress",
      "",
      "## Done",
      "",
    ].join("\n"),
  );
  await fs.writeFile(path.join(tmp, "projects", "acme-bot", "details", "T-001.md"), "Plan: use the HTTP door.\n");
  await fs.writeFile(
    path.join(tmp, "projects", "acme-bot", "comments", "T-001.md"),
    "## 2026-09-01 10:00\nTried stdio over ssh; cwd broke it.\n\n## 2026-09-02 11:00\nHTTP works.\n",
  );
  await fs.writeFile(
    path.join(tmp, "knowledge", "K-001-grid.md"),
    [
      "---",
      "id: K-001",
      "title: Grid",
      "summary: Grids die on trends.",
      "created: 2026-08-01",
      "updated: 2026-08-01",
      "---",
      "",
      "Long human story about the grid.",
      "",
      "## For the AI",
      "",
      "Never propose a grid strategy again.",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(tmp, "knowledge", "K-002-plain.md"),
    ["---", "id: K-002", "title: Plain", "summary: A plain note.", "created: 2026-08-01", "updated: 2026-08-01", "---", "", "Only a body.", ""].join("\n"),
  );
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

describe("parseMentions", () => {
  it("drops what it cannot use, keeps the rest, dedupes and caps", async () => {
    const { parseMentions, MENTION_MAX } = await import("../mentions");
    const out = parseMentions([
      { kind: "note", id: "K-001" },
      { kind: "note", id: "../etc" },
      { kind: "task", type: "project", slug: "acme-bot", id: "T-001.1" },
      { kind: "task", type: "project", slug: "../x", id: "T-001" },
      { kind: "charter", type: "area", slug: "health" },
      { kind: "note", id: "K-001" },
      "junk",
      null,
    ]);
    expect(out).toEqual([
      { kind: "note", id: "K-001" },
      { kind: "task", type: "project", slug: "acme-bot", id: "T-001.1" },
      { kind: "charter", type: "area", slug: "health" },
    ]);
    expect(parseMentions("nope")).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: "note", id: `K-${String(i + 1).padStart(3, "0")}` }));
    expect(parseMentions(many)).toHaveLength(MENTION_MAX);
  });
});

describe("resolveMentions", () => {
  it("injects the summary and the For the AI section, not the body, when a section exists", async () => {
    const { resolveMentions } = await import("../mentions");
    const [r] = await resolveMentions([{ kind: "note", id: "K-001" }]);
    expect(r.found).toBe(true);
    expect(r.label).toBe("K-001 — Grid (note)");
    expect(r.text).toContain("Summary: Grids die on trends.");
    expect(r.text).toContain("Never propose a grid strategy again.");
    expect(r.text).not.toContain("Long human story");
  });

  it("falls back to the body when there is no section", async () => {
    const { resolveMentions } = await import("../mentions");
    const [r] = await resolveMentions([{ kind: "note", id: "K-002" }]);
    expect(r.text).toContain("Only a body.");
  });

  it("says not found rather than inventing", async () => {
    const { resolveMentions } = await import("../mentions");
    const out = await resolveMentions([
      { kind: "note", id: "K-404" },
      { kind: "task", type: "project", slug: "acme-bot", id: "T-999" },
      { kind: "charter", type: "area", slug: "nowhere" },
    ]);
    expect(out.every((r) => !r.found)).toBe(true);
    expect(out[0].text).toContain("K-404: not found");
    expect(out[1].text).toContain("T-999: no such task");
    expect(out[2].text).toContain("area nowhere: not found");
  });

  it("gives a task its line, subtasks, description and log", async () => {
    const { resolveMentions } = await import("../mentions");
    const [r] = await resolveMentions([{ kind: "task", type: "project", slug: "acme-bot", id: "T-001" }]);
    expect(r.label).toBe("T-001 — Wire the laptop (Acme Bot)");
    expect(r.text).toContain("T-001 Wire the laptop · size M · backlog · due 2026-09-30");
    expect(r.text).toContain("- T-001.1 Install the client");
    expect(r.text).toContain("Description:\nPlan: use the HTTP door.");
    expect(r.text).toContain("## 2026-09-01 10:00\nTried stdio over ssh; cwd broke it.");
    expect(r.text).toContain("HTTP works.");
  });

  it("resolves a dotted subtask on its own", async () => {
    const { resolveMentions } = await import("../mentions");
    const [r] = await resolveMentions([{ kind: "task", type: "project", slug: "acme-bot", id: "T-001.1" }]);
    expect(r.found).toBe(true);
    expect(r.text).toContain("Description:\n(none written)");
  });

  it("gives a charter its why, scope and open tasks", async () => {
    const { resolveMentions } = await import("../mentions");
    const [r] = await resolveMentions([{ kind: "charter", type: "project", slug: "acme-bot" }]);
    expect(r.label).toBe("Acme Bot (project acme-bot)");
    expect(r.text).toContain("Why:\nBecause the fixture says so.");
    expect(r.text).toContain("- [ ] G-001 | First light");
    expect(r.text).toContain("Open tasks (3):");
    expect(r.text).toContain("T-002 Plain task");
  });

  it("clips one entry and drops what the total budget cannot hold", async () => {
    const { resolveMentions, MENTION_MAX_CHARS, MENTIONS_MAX_CHARS } = await import("../mentions");
    await fs.writeFile(path.join(tmp, "projects", "acme-bot", "details", "T-002.md"), "x".repeat(MENTION_MAX_CHARS * 2));
    const [one] = await resolveMentions([{ kind: "task", type: "project", slug: "acme-bot", id: "T-002" }]);
    expect(one.text.length).toBeLessThan(MENTION_MAX_CHARS + 100);
    expect(one.text).toContain(`cut at ${MENTION_MAX_CHARS}`);

    const many = Array.from({ length: 5 }, () => ({ kind: "task" as const, type: "project" as const, slug: "acme-bot", id: "T-002" }));
    const out = await resolveMentions(many);
    const total = out.reduce((n, r) => n + r.text.length, 0);
    expect(total).toBeLessThan(MENTIONS_MAX_CHARS + 500);
    expect(out.some((r) => r.text.startsWith("(omitted"))).toBe(true);
  });
});

describe("renderMentions", () => {
  it("is empty with nothing and a headed block otherwise", async () => {
    const { renderMentions } = await import("../mentions");
    expect(renderMentions([])).toBe("");
    const out = renderMentions([{ label: "K-001 — Grid (note)", text: "Summary: S.", found: true }]);
    expect(out.startsWith("# Mentioned by the user")).toBe(true);
    expect(out).toContain("## K-001 — Grid (note)\nSummary: S.");
  });
});
