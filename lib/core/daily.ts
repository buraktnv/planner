import fs from "node:fs/promises";
import path from "node:path";
import type {
  DailyData,
  DailyDelta,
  DailyLogEntry,
  Grocery,
  Habit,
  Meal,
  Rhythm,
} from "./types";
import {
  dailyDir,
  dailyLogPath,
  groceriesPath,
  habitsPath,
  mealsPath,
  rhythmsPath,
} from "./paths";
import { shiftIso, weekRange } from "../ui/momentum";
import { appendJournal } from "./journal";
import { commitData } from "./git";

export class DailyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyParseError";
  }
}

const HABIT_ID = /^H-\d{3,}$/;
const RHYTHM_ID = /^R-\d{3,}$/;
const MEAL_ID = /^M-\d{3,}$/;
const GROCERY_ID = /^G-\d{3,}$/;
const LOG_STAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;

function today(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

function nowTime(): string {
  return new Date().toLocaleTimeString("sv").slice(0, 5);
}

function rows(raw: string): { lineNo: number; text: string }[] {
  return raw
    .split("\n")
    .map((text, i) => ({ lineNo: i + 1, text: text.trim() }))
    .filter((r) => r.text !== "" && !r.text.startsWith("#"));
}

function cells(text: string, lineNo: number, kind: string): string[] {
  if (!text.startsWith("- ")) {
    throw new DailyParseError(`Line ${lineNo}: malformed ${kind} line: ${text}`);
  }
  return text
    .slice(2)
    .split(" | ")
    .map((c) => c.trim());
}

function field(cell: string, lineNo: number, kind: string): [string, string] {
  const at = cell.indexOf(":");
  if (at <= 0) {
    throw new DailyParseError(`Line ${lineNo}: malformed ${kind} field "${cell}"`);
  }
  return [cell.slice(0, at), cell.slice(at + 1).trim()];
}

function positiveInt(value: string, lineNo: number, key: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new DailyParseError(`Line ${lineNo}: ${key} must be a positive integer, got "${value}"`);
  }
  return n;
}

function noPipe(value: string, lineNo: number, key: string): string {
  if (value.includes(" | ")) {
    throw new DailyParseError(`Line ${lineNo}: ${key} may not contain " | "`);
  }
  return value;
}

export function parseHabits(raw: string): Habit[] {
  const out: Habit[] = [];
  const seen = new Set<string>();
  for (const { lineNo, text } of rows(raw)) {
    const parts = cells(text, lineNo, "habit");
    if (parts.length < 3) {
      throw new DailyParseError(`Line ${lineNo}: habit line needs an id, a name and goal: ${text}`);
    }
    const [id, name, ...fields] = parts;
    if (!HABIT_ID.test(id)) {
      throw new DailyParseError(`Line ${lineNo}: invalid habit id "${id}"`);
    }
    if (seen.has(id)) throw new DailyParseError(`Line ${lineNo}: duplicate habit id "${id}"`);
    seen.add(id);
    if (!name) throw new DailyParseError(`Line ${lineNo}: habit ${id} is missing a name`);
    let goal: number | null = null;
    let unit: string | undefined;
    for (const cell of fields) {
      const [key, value] = field(cell, lineNo, "habit");
      if (key === "goal") goal = positiveInt(value, lineNo, "goal");
      else if (key === "unit") unit = noPipe(value, lineNo, "unit") || undefined;
      else throw new DailyParseError(`Line ${lineNo}: unknown habit field key "${key}"`);
    }
    if (goal === null) throw new DailyParseError(`Line ${lineNo}: habit ${id} is missing goal:`);
    out.push({ id, name, goal, unit });
  }
  return out;
}

export function serializeHabits(habits: Habit[]): string {
  return habits
    .map((h) => {
      const parts = [`- ${h.id}`, h.name, `goal:${h.goal}`];
      if (h.unit) parts.push(`unit:${h.unit}`);
      return parts.join(" | ");
    })
    .join("\n")
    .concat(habits.length ? "\n" : "");
}

export function parseRhythms(raw: string): Rhythm[] {
  const out: Rhythm[] = [];
  const seen = new Set<string>();
  for (const { lineNo, text } of rows(raw)) {
    const parts = cells(text, lineNo, "rhythm");
    if (parts.length !== 3) {
      throw new DailyParseError(`Line ${lineNo}: rhythm line needs an id, a name and per: ${text}`);
    }
    const [id, name, perCell] = parts;
    if (!RHYTHM_ID.test(id)) {
      throw new DailyParseError(`Line ${lineNo}: invalid rhythm id "${id}"`);
    }
    if (seen.has(id)) throw new DailyParseError(`Line ${lineNo}: duplicate rhythm id "${id}"`);
    seen.add(id);
    if (!name) throw new DailyParseError(`Line ${lineNo}: rhythm ${id} is missing a name`);
    const [key, value] = field(perCell, lineNo, "rhythm");
    if (key !== "per") throw new DailyParseError(`Line ${lineNo}: unknown rhythm field key "${key}"`);
    out.push({ id, name, per: positiveInt(value, lineNo, "per") });
  }
  return out;
}

export function serializeRhythms(rhythms: Rhythm[]): string {
  return rhythms
    .map((r) => `- ${r.id} | ${r.name} | per:${r.per}`)
    .join("\n")
    .concat(rhythms.length ? "\n" : "");
}

export function parseMeals(raw: string): Meal[] {
  const out: Meal[] = [];
  const seen = new Set<string>();
  for (const { lineNo, text } of rows(raw)) {
    const parts = cells(text, lineNo, "meal");
    if (parts.length !== 3) {
      throw new DailyParseError(
        `Line ${lineNo}: meal line needs an id, a name and servings: ${text}`,
      );
    }
    const [id, name, servingsCell] = parts;
    if (!MEAL_ID.test(id)) throw new DailyParseError(`Line ${lineNo}: invalid meal id "${id}"`);
    if (seen.has(id)) throw new DailyParseError(`Line ${lineNo}: duplicate meal id "${id}"`);
    seen.add(id);
    if (!name) throw new DailyParseError(`Line ${lineNo}: meal ${id} is missing a name`);
    const [key, value] = field(servingsCell, lineNo, "meal");
    if (key !== "servings") {
      throw new DailyParseError(`Line ${lineNo}: unknown meal field key "${key}"`);
    }
    const servings = Number(value);
    if (!Number.isInteger(servings) || servings < 0) {
      throw new DailyParseError(`Line ${lineNo}: servings must be 0 or more, got "${value}"`);
    }
    out.push({ id, name, servings });
  }
  return out;
}

export function serializeMeals(meals: Meal[]): string {
  return meals
    .map((m) => `- ${m.id} | ${m.name} | servings:${m.servings}`)
    .join("\n")
    .concat(meals.length ? "\n" : "");
}

export function parseGroceries(raw: string): Grocery[] {
  const out: Grocery[] = [];
  const seen = new Set<string>();
  for (const { lineNo, text } of rows(raw)) {
    const box = /^- \[( |x|X)\] /.exec(text);
    if (!box) {
      throw new DailyParseError(`Line ${lineNo}: malformed grocery line: ${text}`);
    }
    const got = box[1].toLowerCase() === "x";
    const parts = text
      .slice(box[0].length)
      .split(" | ")
      .map((c) => c.trim());
    if (parts.length !== 3) {
      throw new DailyParseError(
        `Line ${lineNo}: grocery line needs an id, a name and cat: ${text}`,
      );
    }
    const [id, name, catCell] = parts;
    if (!GROCERY_ID.test(id)) {
      throw new DailyParseError(`Line ${lineNo}: invalid grocery id "${id}"`);
    }
    if (seen.has(id)) throw new DailyParseError(`Line ${lineNo}: duplicate grocery id "${id}"`);
    seen.add(id);
    if (!name) throw new DailyParseError(`Line ${lineNo}: grocery ${id} is missing a name`);
    const [key, value] = field(catCell, lineNo, "grocery");
    if (key !== "cat") {
      throw new DailyParseError(`Line ${lineNo}: unknown grocery field key "${key}"`);
    }
    if (!value) throw new DailyParseError(`Line ${lineNo}: grocery ${id} has an empty cat:`);
    out.push({ id, name, cat: noPipe(value, lineNo, "cat"), got });
  }
  return out;
}

export function serializeGroceries(groceries: Grocery[]): string {
  return groceries
    .map((g) => `- [${g.got ? "x" : " "}] ${g.id} | ${g.name} | cat:${g.cat}`)
    .join("\n")
    .concat(groceries.length ? "\n" : "");
}

export function parseDailyLog(raw: string): DailyLogEntry[] {
  const out: DailyLogEntry[] = [];
  for (const { lineNo, text } of rows(raw)) {
    const parts = cells(text, lineNo, "log");
    if (parts.length !== 3) {
      throw new DailyParseError(
        `Line ${lineNo}: log line needs a stamp, an id and a delta: ${text}`,
      );
    }
    const [stamp, id, deltaRaw] = parts;
    const m = LOG_STAMP.exec(stamp);
    if (!m) throw new DailyParseError(`Line ${lineNo}: malformed log stamp "${stamp}"`);
    if (!/^[HRMG]-\d{3,}$/.test(id)) {
      throw new DailyParseError(`Line ${lineNo}: invalid log id "${id}"`);
    }
    let delta: DailyDelta;
    if (deltaRaw === "reset") {
      delta = "reset";
    } else if (/^[+-]\d+$/.test(deltaRaw)) {
      delta = Number(deltaRaw);
    } else {
      throw new DailyParseError(`Line ${lineNo}: invalid log delta "${deltaRaw}"`);
    }
    out.push({ date: m[1], time: m[2], id, delta });
  }
  return out;
}

export function serializeDailyLog(log: DailyLogEntry[]): string {
  return log
    .map((e) => `- ${e.date} ${e.time} | ${e.id} | ${formatDelta(e.delta)}`)
    .join("\n")
    .concat(log.length ? "\n" : "");
}

function formatDelta(delta: DailyDelta): string {
  if (delta === "reset") return "reset";
  return delta >= 0 ? `+${delta}` : String(delta);
}

export function nextDailyId(prefix: "H" | "R" | "M" | "G", existing: { id: string }[]): string {
  let max = 0;
  for (const item of existing) {
    const n = Number(item.id.slice(prefix.length + 1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

async function readOr(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function write(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, "utf8");
}

export async function getDaily(): Promise<DailyData> {
  const [habits, rhythms, meals, groceries, log] = await Promise.all([
    readOr(habitsPath()),
    readOr(rhythmsPath()),
    readOr(mealsPath()),
    readOr(groceriesPath()),
    readOr(dailyLogPath()),
  ]);
  return {
    habits: parseHabits(habits),
    rhythms: parseRhythms(rhythms),
    meals: parseMeals(meals),
    groceries: parseGroceries(groceries),
    log: parseDailyLog(log),
  };
}

async function appendLog(id: string, delta: DailyDelta): Promise<DailyLogEntry> {
  const entry: DailyLogEntry = { date: today(), time: nowTime(), id, delta };
  await fs.mkdir(dailyDir(), { recursive: true });
  await fs.appendFile(dailyLogPath(), serializeDailyLog([entry]), "utf8");
  return entry;
}

export function countIn(log: DailyLogEntry[], id: string, from: string, to: string): number {
  let n = 0;
  for (const e of log) {
    if (e.id !== id) continue;
    if (e.date < from || e.date > to) continue;
    if (e.delta === "reset") n = 0;
    else n += e.delta;
  }
  return Math.max(0, n);
}

export function countOnDay(log: DailyLogEntry[], id: string, date: string): number {
  return countIn(log, id, date, date);
}

export function habitDaysMet(
  log: DailyLogEntry[],
  habits: Habit[],
  from: string,
  to: string,
): number {
  let met = 0;
  for (const habit of habits) {
    for (let day = from; day <= to; day = shiftIso(day, 1)) {
      if (countOnDay(log, habit.id, day) >= habit.goal) met += 1;
    }
  }
  return met;
}

export function servingsEaten(log: DailyLogEntry[], from: string, to: string): number {
  return log
    .filter((e) => e.id.startsWith("M-") && e.date >= from && e.date <= to)
    .reduce((sum, e) => (e.delta === "reset" || e.delta > 0 ? sum : sum - e.delta), 0);
}

export function dailySummary(
  data: DailyData,
  from: string,
  to: string,
): { habitDaysMet: number; rhythmsMet: number; rhythmsTotal: number; servingsEaten: number } {
  const week = weekRange(to);
  return {
    habitDaysMet: habitDaysMet(data.log, data.habits, from, to),
    rhythmsMet: data.rhythms.filter((r) => countIn(data.log, r.id, week.start, week.end) >= r.per)
      .length,
    rhythmsTotal: data.rhythms.length,
    servingsEaten: servingsEaten(data.log, from, to),
  };
}

export async function logHabit(id: string): Promise<{ id: string; delta: DailyDelta }> {
  const data = await getDaily();
  const habit = data.habits.find((h) => h.id === id);
  if (!habit) throw new Error(`Habit not found: ${id}`);
  const day = today();
  const count = countOnDay(data.log, id, day);
  const delta: DailyDelta = count >= habit.goal ? "reset" : 1;
  await appendLog(id, delta);
  await appendJournal("daily", `${habit.name} ${delta === "reset" ? "reset" : "+1"}`);
  await commitData(`daily logged: ${id}`);
  return { id, delta };
}

export async function logRhythm(id: string): Promise<{ id: string; delta: DailyDelta }> {
  const data = await getDaily();
  const rhythm = data.rhythms.find((r) => r.id === id);
  if (!rhythm) throw new Error(`Rhythm not found: ${id}`);
  const week = weekRange(today());
  const count = countIn(data.log, id, week.start, week.end);
  const delta: DailyDelta = count >= rhythm.per ? "reset" : 1;
  await appendLog(id, delta);
  await appendJournal("daily", `${rhythm.name} ${delta === "reset" ? "reset" : "+1"}`);
  await commitData(`daily logged: ${id}`);
  return { id, delta };
}

export async function logDaily(id: string): Promise<{ id: string; delta: DailyDelta }> {
  if (id.startsWith("H-")) return logHabit(id);
  if (id.startsWith("R-")) return logRhythm(id);
  throw new Error(`logDaily takes a habit (H-) or rhythm (R-) id, got: ${id}`);
}

export async function eatMeal(id: string): Promise<Meal> {
  const meals = parseMeals(await readOr(mealsPath()));
  const idx = meals.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error(`Meal not found: ${id}`);
  if (meals[idx].servings === 0) return meals[idx];
  meals[idx] = { ...meals[idx], servings: meals[idx].servings - 1 };
  await write(mealsPath(), serializeMeals(meals));
  await appendLog(id, -1);
  await appendJournal("daily", `ate ${meals[idx].name}`);
  await commitData(`daily meal eaten: ${id}`);
  return meals[idx];
}

export async function setMealServings(id: string, n: number): Promise<Meal> {
  if (!Number.isInteger(n) || n < 0) throw new Error("servings must be 0 or more");
  const meals = parseMeals(await readOr(mealsPath()));
  const idx = meals.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error(`Meal not found: ${id}`);
  meals[idx] = { ...meals[idx], servings: n };
  await write(mealsPath(), serializeMeals(meals));
  await appendJournal("daily", `${meals[idx].name} set to ${n} servings`);
  await commitData(`daily meal servings: ${id}`);
  return meals[idx];
}

export async function toggleGrocery(id: string, got?: boolean): Promise<Grocery> {
  const groceries = parseGroceries(await readOr(groceriesPath()));
  const idx = groceries.findIndex((g) => g.id === id);
  if (idx < 0) throw new Error(`Grocery not found: ${id}`);
  const next = got === undefined ? !groceries[idx].got : got;
  groceries[idx] = { ...groceries[idx], got: next };
  await write(groceriesPath(), serializeGroceries(groceries));
  await appendJournal("daily", `${groceries[idx].name} ${next ? "got" : "back on the list"}`);
  await commitData(`daily grocery: ${id}`);
  return groceries[idx];
}

export async function addGrocery(name: string, cat: string): Promise<Grocery> {
  const trimmed = name.trim();
  const category = (cat || "Other").trim();
  if (!trimmed) throw new Error("addGrocery requires a name");
  if (trimmed.includes(" | ") || category.includes(" | ")) {
    throw new Error('A grocery may not contain " | "');
  }
  const groceries = parseGroceries(await readOr(groceriesPath()));
  const grocery: Grocery = {
    id: nextDailyId("G", groceries),
    name: trimmed,
    cat: category,
    got: false,
  };
  groceries.push(grocery);
  await write(groceriesPath(), serializeGroceries(groceries));
  await appendJournal("daily", `${grocery.id} on the list: ${grocery.name}`);
  await commitData(`daily grocery added: ${grocery.id}`);
  return grocery;
}

export async function clearBoughtGroceries(): Promise<number> {
  const groceries = parseGroceries(await readOr(groceriesPath()));
  const left = groceries.filter((g) => !g.got);
  const removed = groceries.length - left.length;
  if (removed === 0) return 0;
  await write(groceriesPath(), serializeGroceries(left));
  await appendJournal("daily", `cleared ${removed} bought groceries`);
  await commitData(`daily groceries cleared: ${removed}`);
  return removed;
}

export async function addHabit(name: string, goal: number, unit?: string): Promise<Habit> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("addHabit requires a name");
  if (!Number.isInteger(goal) || goal < 1) throw new Error("goal must be a positive integer");
  const habits = parseHabits(await readOr(habitsPath()));
  const habit: Habit = {
    id: nextDailyId("H", habits),
    name: trimmed,
    goal,
    unit: unit?.trim() || undefined,
  };
  habits.push(habit);
  await write(habitsPath(), serializeHabits(habits));
  await appendJournal("daily", `${habit.id} habit added: ${habit.name}`);
  await commitData(`daily habit added: ${habit.id}`);
  return habit;
}

export async function addRhythm(name: string, per: number): Promise<Rhythm> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("addRhythm requires a name");
  if (!Number.isInteger(per) || per < 1) throw new Error("per must be a positive integer");
  const rhythms = parseRhythms(await readOr(rhythmsPath()));
  const rhythm: Rhythm = { id: nextDailyId("R", rhythms), name: trimmed, per };
  rhythms.push(rhythm);
  await write(rhythmsPath(), serializeRhythms(rhythms));
  await appendJournal("daily", `${rhythm.id} rhythm added: ${rhythm.name}`);
  await commitData(`daily rhythm added: ${rhythm.id}`);
  return rhythm;
}

export async function addMeal(name: string, servings: number): Promise<Meal> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("addMeal requires a name");
  if (!Number.isInteger(servings) || servings < 0) throw new Error("servings must be 0 or more");
  const meals = parseMeals(await readOr(mealsPath()));
  const meal: Meal = { id: nextDailyId("M", meals), name: trimmed, servings };
  meals.push(meal);
  await write(mealsPath(), serializeMeals(meals));
  await appendJournal("daily", `${meal.id} meal added: ${meal.name}`);
  await commitData(`daily meal added: ${meal.id}`);
  return meal;
}
