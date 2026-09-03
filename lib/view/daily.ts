import type { DailyData } from "@/lib/core/types";
import { countIn, countOnDay, habitStreak } from "@/lib/core/daily";

export { habitDaysMet, habitStreak, servingsEaten } from "@/lib/core/daily";
import { isoToday, weekRange } from "@/lib/ui/momentum";

export interface HabitRow {
  id: string;
  name: string;
  unit: string | null;
  goal: number;
  today: number;
  pct: number;
  met: boolean;
  streak: number;
  color: string;
  count: string;
}

export interface RhythmRow {
  id: string;
  name: string;
  per: number;
  week: number;
  left: number;
  met: boolean;
  behind: boolean;
  label: string;
  perLabel: string;
  pips: string[];
}

export interface MealRow {
  id: string;
  name: string;
  servings: number;
  gone: boolean;
  left: string;
  pips: boolean[];
}

export interface GroceryItem {
  id: string;
  name: string;
  got: boolean;
}

export interface GroceryGroup {
  cat: string;
  items: GroceryItem[];
}

export interface DailyModel {
  today: string;
  habits: HabitRow[];
  rhythms: RhythmRow[];
  meals: MealRow[];
  groups: GroceryGroup[];
  mealsLeftTotal: number;
  groceryLeft: number;
  habitsLeft: number;
  rhythmsMet: number;
  rhythmsTotal: number;
  empty: boolean;
}

const HABIT_COLORS = ["#8fbfc9", "#7d95dd", "#63b894", "#d9a463", "#c48bc9", "#c9857a"];

export function buildDaily(data: DailyData, today: string = isoToday()): DailyModel {
  const week = weekRange(today);

  const habits: HabitRow[] = data.habits.map((h, i) => {
    const count = countOnDay(data.log, h.id, today);
    return {
      id: h.id,
      name: h.name,
      unit: h.unit ?? null,
      goal: h.goal,
      today: count,
      pct: Math.min(100, (count / h.goal) * 100),
      met: count >= h.goal,
      streak: habitStreak(data.log, h.id, h.goal, today),
      color: HABIT_COLORS[i % HABIT_COLORS.length],
      count: `${count} / ${h.goal}`,
    };
  });

  const rhythms: RhythmRow[] = data.rhythms
    .map((r) => {
      const count = countIn(data.log, r.id, week.start, week.end);
      const met = count >= r.per;
      const left = Math.max(0, r.per - count);
      return {
        id: r.id,
        name: r.name,
        per: r.per,
        week: count,
        left,
        met,
        behind: left >= 2,
        label: `${count} / ${r.per}`,
        perLabel: `${r.per}× A WEEK`,
        pips: Array.from({ length: r.per }, (_, i) =>
          i < count ? (met ? "#63b894" : "#8fbfc9") : "var(--color-edge)",
        ),
      };
    })
    .sort((a, b) => b.left - a.left || a.name.localeCompare(b.name));

  const meals: MealRow[] = data.meals.map((m) => ({
    id: m.id,
    name: m.name,
    servings: m.servings,
    gone: m.servings === 0,
    left: `${m.servings} left`,
    pips: Array.from({ length: Math.max(m.servings, 1) }, (_, i) => i < m.servings),
  }));

  const cats: string[] = [];
  for (const g of data.groceries) if (!cats.includes(g.cat)) cats.push(g.cat);
  const groups: GroceryGroup[] = cats.map((cat) => ({
    cat,
    items: data.groceries
      .filter((g) => g.cat === cat)
      .map((g) => ({ id: g.id, name: g.name, got: g.got })),
  }));

  return {
    today,
    habits,
    rhythms,
    meals,
    groups,
    mealsLeftTotal: data.meals.reduce((a, m) => a + m.servings, 0),
    groceryLeft: data.groceries.filter((g) => !g.got).length,
    habitsLeft: habits.filter((h) => !h.met).length,
    rhythmsMet: rhythms.filter((r) => r.met).length,
    rhythmsTotal: rhythms.length,
    empty:
      data.habits.length === 0 &&
      data.rhythms.length === 0 &&
      data.meals.length === 0 &&
      data.groceries.length === 0,
  };
}
