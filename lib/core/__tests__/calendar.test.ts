import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import {
  CalendarParseError,
  nextEventId,
  parseEvents,
  serializeEvents,
  sortEvents,
} from "../calendar";
import type { CalendarEvent } from "../types";

const SAMPLE = [
  "- [ ] E-001 | 2026-09-01 | Passport appointment | time:09:40 | note:bring photos | scope:area:admin | action:photos not printed",
  "- [x] E-002 | 2026-08-29 | Grocery run + prep | time:morning | scope:area:daily",
  "- [ ] E-003 | 2026-09-04 | Kickoff call | scope:widget-shop",
  "- [ ] E-004 | 1990-03-04 | A birthday | note:born 1990 | action:buy a gift | repeat:yearly | lead:7d",
  "- [ ] E-005 | 2026-09-24 | Passport pickup | action:photoshoot | lead:21d",
].join("\n");

describe("calendar parser", () => {
  it("parses the fixed grammar", () => {
    const events = parseEvents(`${SAMPLE}\n`);
    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({
      id: "E-001",
      date: "2026-09-01",
      title: "Passport appointment",
      done: false,
      time: "09:40",
      note: "bring photos",
      scope: "area:admin",
      action: "photos not printed",
    });
    expect(events[1].done).toBe(true);
    expect(events[2].time).toBeUndefined();
    expect(events[2].scope).toBe("widget-shop");
    expect(events[3].repeat).toBe("yearly");
    expect(events[3].lead).toBe(7);
    expect(events[4].repeat).toBeUndefined();
    expect(events[4].lead).toBe(21);
  });

  it("serialises repeat and lead last, in that order", () => {
    const line = serializeEvents([
      {
        id: "E-001",
        date: "2026-09-24",
        title: "Passport",
        done: false,
        lead: 21,
        repeat: "yearly",
        action: "photoshoot",
        time: "09:40",
      },
    ]).trim();
    expect(line).toBe(
      "- [ ] E-001 | 2026-09-24 | Passport | time:09:40 | action:photoshoot | repeat:yearly | lead:21d",
    );
  });

  it("round-trips parse → serialize → parse", () => {
    const first = parseEvents(`${SAMPLE}\n`);
    const raw = serializeEvents(first);
    const second = parseEvents(raw);
    expect(second).toEqual(sortEvents(first));
    expect(serializeEvents(second)).toBe(raw);
  });

  it("tolerates blank lines, headings and CRLF", () => {
    const raw = `# Calendar\r\n\r\n${SAMPLE.replace(/\n/g, "\r\n")}\r\n`;
    expect(parseEvents(raw)).toHaveLength(5);
  });

  it("sorts by date, then time, then id on write", () => {
    const events: CalendarEvent[] = [
      { id: "E-004", date: "2026-09-02", title: "Late", done: false, time: "18:00" },
      { id: "E-002", date: "2026-09-01", title: "Second", done: false },
      { id: "E-001", date: "2026-09-02", title: "Early", done: false, time: "08:00" },
      { id: "E-003", date: "2026-09-01", title: "First", done: false },
    ];
    const lines = serializeEvents(events).trim().split("\n");
    expect(lines.map((l) => l.slice(6, 11))).toEqual(["E-002", "E-003", "E-001", "E-004"]);
  });

  it("allocates monotonic ids", () => {
    expect(nextEventId([])).toBe("E-001");
    expect(
      nextEventId([
        { id: "E-001", date: "2026-09-01", title: "a", done: false },
        { id: "E-012", date: "2026-09-01", title: "b", done: true },
      ]),
    ).toBe("E-013");
    expect(
      nextEventId([{ id: "E-0999", date: "2026-09-01", title: "a", done: false }]),
    ).toBe("E-1000");
  });

  it.each([
    ["not a task line", "hello there"],
    ["bad id", "- [ ] E-1 | 2026-09-01 | Title"],
    ["missing id prefix", "- [ ] 001 | 2026-09-01 | Title"],
    ["bad date", "- [ ] E-001 | 01/09/2026 | Title"],
    ["missing title", "- [ ] E-001 | 2026-09-01 | "],
    ["unknown field", "- [ ] E-001 | 2026-09-01 | Title | when:09:40"],
    ["empty field value", "- [ ] E-001 | 2026-09-01 | Title | note:"],
    ["long time", "- [ ] E-001 | 2026-09-01 | Title | time:thirteen chars"],
    ["bad scope", "- [ ] E-001 | 2026-09-01 | Title | scope:Not A Slug"],
    ["repeated field", "- [ ] E-001 | 2026-09-01 | Title | time:09:40 | time:10:00"],
    ["daily repeat", "- [ ] E-001 | 2026-09-01 | Title | repeat:daily"],
    ["zero lead", "- [ ] E-001 | 2026-09-01 | Title | lead:0d"],
    ["lead without unit", "- [ ] E-001 | 2026-09-01 | Title | lead:21"],
    ["zero-padded lead", "- [ ] E-001 | 2026-09-01 | Title | lead:021d"],
    ["lead over the cap", "- [ ] E-001 | 2026-09-01 | Title | lead:1000d"],
  ])("throws CalendarParseError on %s", (_label, line) => {
    expect(() => parseEvents(`${line}\n`)).toThrow(CalendarParseError);
  });

  it("throws on duplicate ids with the line number", () => {
    const raw = "- [ ] E-001 | 2026-09-01 | One\n- [ ] E-001 | 2026-09-02 | Two\n";
    expect(() => parseEvents(raw)).toThrow(/Line 2: duplicate event id "E-001"/);
  });
});

describe("calendar store", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-calendar-"));
    process.env.PLANNER_DATA_DIR = tmp;
    const git = simpleGit(tmp);
    await git.init();
    await git.addConfig("user.name", "test");
    await git.addConfig("user.email", "test@example.com");
  });

  afterEach(async () => {
    delete process.env.PLANNER_DATA_DIR;
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
  });

  function localDate(): string {
    return new Date().toLocaleDateString("sv").slice(0, 10);
  }

  async function commitCount(): Promise<number> {
    const log = await simpleGit(tmp).log();
    return log.all.length;
  }

  it("listEvents returns [] when there is no calendar.md", async () => {
    const { listEvents } = await import("../calendar");
    expect(await listEvents()).toEqual([]);
  });

  it("addEvent writes a sorted file, journals and commits", async () => {
    const { addEvent, listEvents } = await import("../calendar");
    const second = await addEvent({ date: "2026-09-05", title: "Later thing" });
    expect(second.id).toBe("E-001");
    const first = await addEvent({
      date: "2026-09-01",
      title: "Earlier thing",
      time: "09:40",
      note: "bring photos",
      scope: "area:admin",
      action: "photos not printed",
    });
    expect(first.id).toBe("E-002");

    const raw = await fs.readFile(path.join(tmp, "calendar.md"), "utf8");
    expect(raw).toBe(
      "- [ ] E-002 | 2026-09-01 | Earlier thing | time:09:40 | note:bring photos | scope:area:admin | action:photos not printed\n" +
        "- [ ] E-001 | 2026-09-05 | Later thing\n",
    );

    const events = await listEvents();
    expect(events.map((e) => e.id)).toEqual(["E-002", "E-001"]);

    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toContain("[admin] E-002 event added: Earlier thing");
    expect(journal).toContain("[calendar] E-001 event added: Later thing");
    expect(await commitCount()).toBeGreaterThanOrEqual(2);
  });

  it("listEvents filters by an inclusive range", async () => {
    const { addEvent, listEvents } = await import("../calendar");
    await addEvent({ date: "2026-09-01", title: "A" });
    await addEvent({ date: "2026-09-10", title: "B" });
    await addEvent({ date: "2026-09-20", title: "C" });
    const mid = await listEvents({ from: "2026-09-10", to: "2026-09-20" });
    expect(mid.map((e) => e.title)).toEqual(["B", "C"]);
    expect((await listEvents({ to: "2026-09-01" })).map((e) => e.title)).toEqual(["A"]);
  });

  it("updateEvent patches any field and clears with an empty string", async () => {
    const { addEvent, listEvents, updateEvent } = await import("../calendar");
    const e = await addEvent({
      date: "2026-09-01",
      title: "Passport appointment",
      action: "photos not printed",
      time: "09:40",
    });
    const cleared = await updateEvent(e.id, { action: "" });
    expect(cleared.action).toBeUndefined();
    const moved = await updateEvent(e.id, { date: "2026-09-03", done: true, note: "rescheduled" });
    expect(moved.date).toBe("2026-09-03");
    expect(moved.done).toBe(true);
    const raw = await fs.readFile(path.join(tmp, "calendar.md"), "utf8");
    expect(raw).toBe("- [x] E-001 | 2026-09-03 | Passport appointment | time:09:40 | note:rescheduled\n");
    expect((await listEvents())[0].done).toBe(true);
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toContain("E-001 event done");
  });

  it("ticking a repeating event advances its date and leaves it open", async () => {
    const { addEvent, listEvents, updateEvent } = await import("../calendar");
    const e = await addEvent({
      date: "1990-03-04",
      title: "A birthday",
      repeat: "yearly",
      lead: 7,
      action: "buy a gift",
    });
    expect(e.repeat).toBe("yearly");
    expect(e.lead).toBe(7);
    const advanced = await updateEvent(e.id, { done: true }, "2027-03-04");
    expect(advanced.date).toBe("2028-03-04");
    expect(advanced.done).toBe(false);
    const raw = await fs.readFile(path.join(tmp, "calendar.md"), "utf8");
    expect(raw).toBe(
      "- [ ] E-001 | 2028-03-04 | A birthday | action:buy a gift | repeat:yearly | lead:7d\n",
    );
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toContain("E-001 event advanced to 2028-03-04");
    expect((await listEvents())[0].done).toBe(false);
  });

  it("clears repeat with an empty string and lead with zero", async () => {
    const { addEvent, updateEvent } = await import("../calendar");
    const e = await addEvent({ date: "2026-09-24", title: "Passport", repeat: "weekly", lead: 21 });
    const cleared = await updateEvent(e.id, { repeat: "", lead: 0 });
    expect(cleared.repeat).toBeUndefined();
    expect(cleared.lead).toBeUndefined();
    const raw = await fs.readFile(path.join(tmp, "calendar.md"), "utf8");
    expect(raw).toBe("- [ ] E-001 | 2026-09-24 | Passport\n");
  });

  it("rejects a repeat or lead the grammar cannot hold", async () => {
    const { addEvent } = await import("../calendar");
    await expect(addEvent({ date: "2026-09-01", title: "ok", repeat: "daily" })).rejects.toThrow(
      /Invalid repeat/,
    );
    await expect(addEvent({ date: "2026-09-01", title: "ok", lead: 1000 })).rejects.toThrow(
      /Invalid lead/,
    );
    await expect(addEvent({ date: "2026-09-01", title: "ok", lead: 2.5 })).rejects.toThrow(
      /Invalid lead/,
    );
  });

  it("listEvents range includes a repeating event anchored before the range", async () => {
    const { addEvent, listEvents } = await import("../calendar");
    await addEvent({ date: "2026-08-03", title: "Standup", repeat: "weekly" });
    await addEvent({ date: "2026-08-03", title: "Once", });
    const hits = await listEvents({ from: "2026-09-01", to: "2026-09-14" });
    expect(hits.map((e) => e.title)).toEqual(["Standup"]);
    expect((await listEvents({ from: "2026-09-01" })).map((e) => e.title)).toEqual(["Standup"]);
  });

  it("updateEvent throws for an unknown id", async () => {
    const { updateEvent } = await import("../calendar");
    await expect(updateEvent("E-404", { done: true })).rejects.toThrow(/Event not found/);
  });

  it("rejects values that would break the grammar", async () => {
    const { addEvent } = await import("../calendar");
    await expect(addEvent({ date: "2026-09-01", title: "a | b" })).rejects.toThrow(/ \| /);
    await expect(addEvent({ date: "01-09-2026", title: "ok" })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(
      addEvent({ date: "2026-09-01", title: "ok", time: "much too long" }),
    ).rejects.toThrow(/12 characters/);
    await expect(addEvent({ date: "2026-09-01", title: "ok", scope: "Bad Slug" })).rejects.toThrow(
      /Invalid scope/,
    );
  });
});
