import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

function localDate(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-daily-"));
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

async function seed(files: Partial<Record<"habits" | "rhythms" | "meals" | "groceries" | "log", string>>) {
  await fs.mkdir(path.join(tmp, "daily"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await fs.writeFile(path.join(tmp, "daily", `${name}.md`), body ?? "", "utf8");
  }
}

const HABITS = "- H-001 | Walk | goal:4 | unit:× 15 min\n- H-002 | Water | goal:6\n";
const RHYTHMS = "- R-001 | Laundry | per:3\n- R-002 | Kitchen reset | per:5\n";
const MEALS = "- M-001 | Lentil soup | servings:2\n- M-002 | Roast vegetables | servings:0\n";
const GROCERIES = "- [ ] G-001 | Red lentils | cat:Staples\n- [x] G-003 | Olive oil | cat:Staples\n";
const LOG = "- 2026-08-28 09:12 | H-001 | +1\n- 2026-08-28 19:40 | R-002 | +1\n- 2026-08-28 20:05 | M-001 | -1\n";

describe("daily parsers", () => {
  it("round-trips habits", async () => {
    const { parseHabits, serializeHabits } = await import("../daily");
    const habits = parseHabits(HABITS);
    expect(habits).toEqual([
      { id: "H-001", name: "Walk", goal: 4, unit: "× 15 min" },
      { id: "H-002", name: "Water", goal: 6, unit: undefined },
    ]);
    expect(serializeHabits(habits)).toBe(HABITS);
    expect(parseHabits(serializeHabits(habits))).toEqual(habits);
  });

  it("round-trips rhythms, meals, groceries and the log", async () => {
    const {
      parseRhythms,
      serializeRhythms,
      parseMeals,
      serializeMeals,
      parseGroceries,
      serializeGroceries,
      parseDailyLog,
      serializeDailyLog,
    } = await import("../daily");
    expect(serializeRhythms(parseRhythms(RHYTHMS))).toBe(RHYTHMS);
    expect(serializeMeals(parseMeals(MEALS))).toBe(MEALS);
    expect(serializeGroceries(parseGroceries(GROCERIES))).toBe(GROCERIES);
    expect(serializeDailyLog(parseDailyLog(LOG))).toBe(LOG);
    expect(parseGroceries(GROCERIES)[1]).toEqual({
      id: "G-003",
      name: "Olive oil",
      cat: "Staples",
      got: true,
    });
    expect(parseDailyLog(LOG)[2]).toEqual({
      date: "2026-08-28",
      time: "20:05",
      id: "M-001",
      delta: -1,
    });
  });

  it("parses a reset log line", async () => {
    const { parseDailyLog, serializeDailyLog } = await import("../daily");
    const raw = "- 2026-08-28 21:00 | H-001 | reset\n";
    expect(parseDailyLog(raw)[0].delta).toBe("reset");
    expect(serializeDailyLog(parseDailyLog(raw))).toBe(raw);
  });

  it("ignores headings and blank lines", async () => {
    const { parseHabits } = await import("../daily");
    expect(parseHabits("# Habits\n\n- H-001 | Walk | goal:4\n\n")).toHaveLength(1);
  });

  it("throws with a line number on malformed lines", async () => {
    const { parseHabits, parseRhythms, parseMeals, parseGroceries, parseDailyLog, DailyParseError } =
      await import("../daily");
    expect(() => parseHabits("- H-1 | Walk | goal:4")).toThrow(DailyParseError);
    expect(() => parseHabits("- H-001 | Walk")).toThrow(/Line 1/);
    expect(() => parseHabits("- H-001 | Walk | goal:0")).toThrow(/positive integer/);
    expect(() => parseHabits("- H-001 | Walk | goal:4 | nope:1")).toThrow(/unknown habit field/);
    expect(() => parseHabits("- H-001 | Walk | goal:4\n- H-001 | Water | goal:2")).toThrow(
      /Line 2: duplicate/,
    );
    expect(() => parseRhythms("- R-001 | Laundry | per:x")).toThrow(DailyParseError);
    expect(() => parseMeals("- M-001 | Soup | servings:-1")).toThrow(/0 or more/);
    expect(() => parseGroceries("- G-001 | Lentils | cat:Staples")).toThrow(/malformed grocery/);
    expect(() => parseDailyLog("- 2026-8-28 09:12 | H-001 | +1")).toThrow(/malformed log stamp/);
    expect(() => parseDailyLog("- 2026-08-28 09:12 | H-001 | up")).toThrow(/invalid log delta/);
  });

  it("allocates monotonic ids", async () => {
    const { nextDailyId } = await import("../daily");
    expect(nextDailyId("G", [{ id: "G-001" }, { id: "G-003" }])).toBe("G-004");
    expect(nextDailyId("H", [])).toBe("H-001");
  });
});

describe("daily counting", () => {
  it("counts a day and resets on a reset line", async () => {
    const { countOnDay, countIn } = await import("../daily");
    const log = [
      { date: "2026-08-28", time: "09:00", id: "H-001", delta: 1 as const },
      { date: "2026-08-28", time: "10:00", id: "H-001", delta: 1 as const },
      { date: "2026-08-28", time: "11:00", id: "H-001", delta: "reset" as const },
      { date: "2026-08-28", time: "12:00", id: "H-001", delta: 1 as const },
      { date: "2026-08-27", time: "09:00", id: "H-001", delta: 1 as const },
    ];
    expect(countOnDay(log, "H-001", "2026-08-28")).toBe(1);
    expect(countOnDay(log, "H-001", "2026-08-27")).toBe(1);
    expect(countIn(log, "H-001", "2026-08-27", "2026-08-28")).toBe(2);
    expect(countOnDay(log, "H-002", "2026-08-28")).toBe(0);
  });
});

describe("daily store", () => {
  it("getDaily returns empty lists when nothing exists", async () => {
    const { getDaily } = await import("../daily");
    expect(await getDaily()).toEqual({
      habits: [],
      rhythms: [],
      meals: [],
      groceries: [],
      log: [],
    });
  });

  it("logHabit appends +1, journals and commits", async () => {
    await seed({ habits: HABITS });
    const { logHabit, getDaily } = await import("../daily");
    const res = await logHabit("H-001");
    expect(res.delta).toBe(1);
    const data = await getDaily();
    expect(data.log).toHaveLength(1);
    expect(data.log[0]).toMatchObject({ id: "H-001", delta: 1, date: localDate() });
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toContain("[daily] Walk +1");
    const log = await simpleGit(tmp).log();
    expect(log.all.length).toBeGreaterThanOrEqual(1);
  });

  it("logHabit wraps around once the goal is met", async () => {
    await seed({ habits: "- H-001 | Walk | goal:2\n" });
    const { logHabit, getDaily } = await import("../daily");
    await logHabit("H-001");
    await logHabit("H-001");
    const third = await logHabit("H-001");
    expect(third.delta).toBe("reset");
    const data = await getDaily();
    const { countOnDay } = await import("../daily");
    expect(countOnDay(data.log, "H-001", localDate())).toBe(0);
  });

  it("logRhythm wraps around on the weekly count", async () => {
    await seed({ rhythms: "- R-001 | Laundry | per:1\n" });
    const { logRhythm, getDaily, countIn } = await import("../daily");
    await logRhythm("R-001");
    const second = await logRhythm("R-001");
    expect(second.delta).toBe("reset");
    const { weekRange } = await import("../../ui/momentum");
    const week = weekRange(localDate());
    const data = await getDaily();
    expect(countIn(data.log, "R-001", week.start, week.end)).toBe(0);
  });

  it("logDaily rejects an id that is not a habit or rhythm", async () => {
    const { logDaily } = await import("../daily");
    await expect(logDaily("M-001")).rejects.toThrow(/habit \(H-\) or rhythm/);
  });

  it("eatMeal decrements servings in place and logs -1", async () => {
    await seed({ meals: MEALS });
    const { eatMeal, getDaily } = await import("../daily");
    const meal = await eatMeal("M-001");
    expect(meal.servings).toBe(1);
    const data = await getDaily();
    expect(data.meals[0].servings).toBe(1);
    expect(data.log[0]).toMatchObject({ id: "M-001", delta: -1 });
  });

  it("eatMeal is a no-op at zero servings", async () => {
    await seed({ meals: MEALS });
    const { eatMeal, getDaily } = await import("../daily");
    expect((await eatMeal("M-002")).servings).toBe(0);
    expect((await getDaily()).log).toHaveLength(0);
  });

  it("setMealServings writes the new count", async () => {
    await seed({ meals: MEALS });
    const { setMealServings } = await import("../daily");
    expect((await setMealServings("M-002", 4)).servings).toBe(4);
    const raw = await fs.readFile(path.join(tmp, "daily", "meals.md"), "utf8");
    expect(raw).toContain("- M-002 | Roast vegetables | servings:4");
  });

  it("toggleGrocery flips and honours an explicit value", async () => {
    await seed({ groceries: GROCERIES });
    const { toggleGrocery } = await import("../daily");
    expect((await toggleGrocery("G-001")).got).toBe(true);
    expect((await toggleGrocery("G-001", false)).got).toBe(false);
    await expect(toggleGrocery("G-999")).rejects.toThrow(/not found/);
  });

  it("addGrocery allocates the next id and clearBoughtGroceries drops bought rows", async () => {
    await seed({ groceries: GROCERIES });
    const { addGrocery, clearBoughtGroceries, getDaily } = await import("../daily");
    const added = await addGrocery("Lemons", "Produce");
    expect(added.id).toBe("G-004");
    expect(await clearBoughtGroceries()).toBe(1);
    const data = await getDaily();
    expect(data.groceries.map((g) => g.id)).toEqual(["G-001", "G-004"]);
    expect(await clearBoughtGroceries()).toBe(0);
  });

  it("addGrocery rejects a piped name", async () => {
    const { addGrocery } = await import("../daily");
    await expect(addGrocery("bad | name", "Staples")).rejects.toThrow(/may not contain/);
  });

  it("addHabit, addRhythm and addMeal write parseable lines", async () => {
    const { addHabit, addRhythm, addMeal, getDaily } = await import("../daily");
    await addHabit("Stretch", 2, "× 10 min");
    await addRhythm("Floors", 2);
    await addMeal("Bulgur pilaf", 1);
    const data = await getDaily();
    expect(data.habits).toEqual([{ id: "H-001", name: "Stretch", goal: 2, unit: "× 10 min" }]);
    expect(data.rhythms).toEqual([{ id: "R-001", name: "Floors", per: 2 }]);
    expect(data.meals).toEqual([{ id: "M-001", name: "Bulgur pilaf", servings: 1 }]);
    await expect(addHabit("Bad", 0)).rejects.toThrow(/positive integer/);
  });
});
