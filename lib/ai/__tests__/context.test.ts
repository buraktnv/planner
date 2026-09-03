import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { isoToday, shiftIso } from "@/lib/ui/momentum";

let tmp: string;
const today = isoToday();

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-context-"));
  process.env.PLANNER_DATA_DIR = tmp;
  await fs.mkdir(path.join(tmp, "projects"), { recursive: true });
  await fs.mkdir(path.join(tmp, "areas"), { recursive: true });
  await fs.writeFile(path.join(tmp, "about.md"), "A fixture person.\n");
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

async function writeCharter(type: "project" | "area", slug: string, name: string) {
  const dir = path.join(tmp, type === "project" ? "projects" : "areas");
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

async function writeTasks(slug: string, backlog: string[]) {
  const dir = path.join(tmp, "projects", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "tasks.md"),
    ["## Backlog", ...backlog, "", "## In progress", "", "## Done", ""].join("\n"),
  );
}

async function writeJournal(lines: string[]) {
  await fs.mkdir(path.join(tmp, "journal"), { recursive: true });
  await fs.writeFile(path.join(tmp, "journal", `${today}.md`), `# ${today}\n\n${lines.join("\n")}\n`);
}

async function writeDaily() {
  await fs.mkdir(path.join(tmp, "daily"), { recursive: true });
  await fs.writeFile(path.join(tmp, "daily", "habits.md"), "- H-001 | Walk | goal:1\n");
  await fs.writeFile(
    path.join(tmp, "daily", "log.md"),
    `- ${shiftIso(today, -1)} 09:00 | H-001 | +1\n- ${today} 09:00 | H-001 | +1\n`,
  );
}

describe("buildSystemContext without a focus", () => {
  it("includes the journal, the habit trends and the list of areas", async () => {
    const { buildSystemContext } = await import("../context");
    await writeCharter("area", "health", "Health");
    await writeJournal(["- 09:12 [life] Mood: good", "- 10:00 [alpha] T-001 done"]);
    await writeDaily();

    const ctx = await buildSystemContext();
    expect(ctx).toContain("# Life");
    expect(ctx).toContain("## Journal (last 7 days)");
    expect(ctx).toContain("- 09:12 [life] Mood: good");
    expect(ctx).toContain("## Habits and rhythms (last 8 weeks, current week starred)");
    expect(ctx).toMatch(/H-001 Walk: last 4 wks .* · streak 2 · logged today/);
    expect(ctx).toContain("Areas: area:health (Health)");
    expect(ctx).toContain("# Capture");
  });

  it("leaves the Life block out when there is nothing to show", async () => {
    const { buildSystemContext } = await import("../context");
    const ctx = await buildSystemContext();
    expect(ctx).not.toContain("# Life");
    expect(ctx).not.toContain("Areas:");
  });

  it("caps the journal at the most recent forty lines", async () => {
    const { buildSystemContext, JOURNAL_LINE_CAP } = await import("../context");
    const lines = Array.from({ length: 60 }, (_, i) => `- 09:${String(i).padStart(2, "0")} [life] entry ${i}`);
    await writeJournal(lines);
    const ctx = await buildSystemContext();
    expect(ctx).toContain(`(+${60 - JOURNAL_LINE_CAP} earlier lines this week)`);
    expect(ctx).not.toContain("[life] entry 0\n");
    expect(ctx).toContain("[life] entry 59");
  });

  it("carries the mode instruction and a digest of earlier messages", async () => {
    const { buildSystemContext } = await import("../context");
    const plain = await buildSystemContext(undefined, "checkin");
    expect(plain).toContain("# Mode: Check-in");
    expect(plain).toContain("Check in on the day or the week");
    expect(plain).not.toContain("# Earlier in this conversation");

    const withDigest = await buildSystemContext(undefined, undefined, undefined, undefined, "Tools used: create_task (T-041)");
    expect(withDigest).toContain("# Earlier in this conversation");
    expect(withDigest).toContain("Tools used: create_task (T-041)");
  });

  it("lists a calendar event inside its lead window and not the same event without one", async () => {
    const { buildSystemContext } = await import("../context");
    const date = shiftIso(today, 20);
    await fs.writeFile(
      path.join(tmp, "calendar.md"),
      `- [ ] E-001 | ${date} | Passport pickup | action:photoshoot | lead:21d\n- [ ] E-002 | ${date} | Plain event\n`,
    );
    const ctx = await buildSystemContext();
    expect(ctx).toContain(`- ${date} (in 20 days) E-001 Passport pickup ACTION NEEDED: photoshoot`);
    expect(ctx).not.toContain("E-002");
  });
});

describe("buildSystemContext with a focus", () => {
  it("caps open tasks at thirty, ranked, and says how many more there are", async () => {
    const { buildSystemContext, OPEN_TASK_CAP } = await import("../context");
    await writeCharter("project", "alpha", "Alpha");
    const tasks = Array.from({ length: 45 }, (_, i) =>
      `- [ ] T-${String(i + 1).padStart(3, "0")} | M | Task ${i + 1} | created:2026-08-01${i === 44 ? ` | due:${shiftIso(today, -1)}` : ""}`,
    );
    await writeTasks("alpha", tasks);
    const ctx = await buildSystemContext({ type: "project", slug: "alpha" });
    expect(ctx).toContain("## Open tasks (45)");
    expect(ctx).toContain(`(+${45 - OPEN_TASK_CAP} more — ask next_actions or get_context for the rest)`);
    const block = ctx.slice(ctx.indexOf("## Open tasks"), ctx.indexOf("# Journal"));
    expect(block.indexOf("T-045")).toBeLessThan(block.indexOf("T-001"));
    expect(block).not.toContain("T-044");
    expect(ctx).toContain("# Journal (last 7 days)");
    expect(ctx).not.toContain("# Life");
  });
});
