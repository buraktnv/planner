"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DailyModel, GroceryGroup, HabitRow, MealRow, RhythmRow } from "@/lib/view/daily";
import { shortDate, weekdayOf } from "@/lib/ui/momentum";
import { Mono, Rule, Tick } from "../primitives";

type Section = "habit" | "rhythm" | "meal" | "grocery";

interface Local {
  src: DailyModel;
  habits: HabitRow[];
  rhythms: RhythmRow[];
  meals: MealRow[];
  groups: GroceryGroup[];
}

function snapshotOf(model: DailyModel): Local {
  return {
    src: model,
    habits: model.habits,
    rhythms: model.rhythms,
    meals: model.meals,
    groups: model.groups,
  };
}

function AddButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0">
      <Mono className="text-[9px] tracking-[0.14em] text-faint transition-colors hover:text-ink">
        {open ? "CLOSE" : "+ ADD"}
      </Mono>
    </button>
  );
}

function AddForm({
  fields,
  onSubmit,
}: {
  fields: { key: string; label: string; kind: "text" | "number"; value: string }[];
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
        setValues(Object.fromEntries(fields.map((f) => [f.key, f.value])));
      }}
      className="mb-2.5 flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed border-edge px-3.5 py-2.5"
    >
      {fields.map((f) => (
        <input
          key={f.key}
          type={f.kind}
          value={values[f.key] ?? ""}
          placeholder={f.label}
          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          className={`rounded-[9px] border border-edge bg-surf px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink ${
            f.kind === "number" ? "w-[70px]" : "min-w-0 flex-1"
          }`}
        />
      ))}
      <button
        type="submit"
        className="rounded-[9px] bg-quick px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
      >
        Add
      </button>
    </form>
  );
}

export default function DailyView({ model }: { model: DailyModel }) {
  const router = useRouter();
  const [local, setLocal] = useState<Local>(() => snapshotOf(model));
  const [adding, setAdding] = useState<Section | null>(null);

  if (local.src !== model) setLocal(snapshotOf(model));

  const { habits, rhythms, meals, groups } = local;
  const setHabits = (fn: (rows: HabitRow[]) => HabitRow[]) =>
    setLocal((s) => ({ ...s, habits: fn(s.habits) }));
  const setRhythms = (fn: (rows: RhythmRow[]) => RhythmRow[]) =>
    setLocal((s) => ({ ...s, rhythms: fn(s.rhythms) }));
  const setMeals = (fn: (rows: MealRow[]) => MealRow[]) =>
    setLocal((s) => ({ ...s, meals: fn(s.meals) }));
  const setGroups = (fn: (rows: GroceryGroup[]) => GroceryGroup[]) =>
    setLocal((s) => ({ ...s, groups: fn(s.groups) }));

  const send = async (url: string, init?: RequestInit) => {
    try {
      await fetch(url, {
        headers: { "content-type": "application/json" },
        ...init,
      });
    } finally {
      router.refresh();
    }
  };

  const tapHabit = (h: HabitRow) => {
    const next = h.today >= h.goal ? 0 : h.today + 1;
    setHabits((rows) =>
      rows.map((r) =>
        r.id === h.id
          ? {
              ...r,
              today: next,
              met: next >= r.goal,
              pct: Math.min(100, (next / r.goal) * 100),
              count: `${next} / ${r.goal}`,
            }
          : r,
      ),
    );
    void send("/api/daily/log", { method: "POST", body: JSON.stringify({ id: h.id }) });
  };

  const tapRhythm = (r: RhythmRow) => {
    const next = r.week >= r.per ? 0 : r.week + 1;
    const met = next >= r.per;
    setRhythms((rows) =>
      rows.map((row) =>
        row.id === r.id
          ? {
              ...row,
              week: next,
              met,
              left: Math.max(0, row.per - next),
              behind: row.per - next >= 2,
              label: `${next} / ${row.per}`,
              pips: Array.from({ length: row.per }, (_, i) =>
                i < next ? (met ? "#63b894" : "#8fbfc9") : "var(--color-edge)",
              ),
            }
          : row,
      ),
    );
    void send("/api/daily/log", { method: "POST", body: JSON.stringify({ id: r.id }) });
  };

  const tapMeal = (m: MealRow) => {
    if (m.servings === 0) return;
    const next = m.servings - 1;
    setMeals((rows) =>
      rows.map((row) =>
        row.id === m.id
          ? {
              ...row,
              servings: next,
              gone: next === 0,
              left: `${next} left`,
              pips: Array.from({ length: Math.max(row.pips.length, 1) }, (_, i) => i < next),
            }
          : row,
      ),
    );
    void send(`/api/daily/meals/${m.id}/eat`, { method: "POST" });
  };

  const tapGrocery = (id: string, got: boolean) => {
    setGroups((gs) =>
      gs.map((g) => ({
        ...g,
        items: g.items.map((i) => (i.id === id ? { ...i, got: !got } : i)),
      })),
    );
    void send(`/api/daily/groceries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ got: !got }),
    });
  };

  const mealsLeftTotal = meals.reduce((a, m) => a + m.servings, 0);
  const groceryLeft = groups.reduce((a, g) => a + g.items.filter((i) => !i.got).length, 0);
  const rhythmsMet = rhythms.filter((r) => r.met).length;

  return (
    <div className="mx-auto max-w-[800px] px-9 pt-[52px] pb-[90px]">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Daily</h1>
        <Mono className="text-[10px] tracking-[0.1em] text-faint">
          {weekdayOf(model.today)} {shortDate(model.today)}
        </Mono>
        <div className="flex-1" />
        {rhythms.length > 0 && (
          <Mono className="rounded-[7px] bg-quick-tint px-2.5 py-[5px] text-[10px] text-quick-ink">
            {rhythmsMet} / {rhythms.length} RHYTHMS MET
          </Mono>
        )}
      </div>

      {model.empty && (
        <div className="mb-8 rounded-[18px] border border-dashed border-edge px-[18px] py-4 text-[13px] leading-[1.6] text-dim">
          Nothing here yet. The Daily screen reads four files in the{" "}
          <span className="font-mono text-[12px]">daily/</span> directory of the data repo:{" "}
          <span className="font-mono text-[12px]">habits.md</span> (a per-day goal),{" "}
          <span className="font-mono text-[12px]">rhythms.md</span> (a per-week count),{" "}
          <span className="font-mono text-[12px]">meals.md</span> (servings in the fridge) and{" "}
          <span className="font-mono text-[12px]">groceries.md</span> (a list by category). Every tap
          appends a line to <span className="font-mono text-[12px]">daily/log.md</span>. Add the
          first one with + ADD below.
        </div>
      )}

      <Rule
        label="TODAY — TAP TO COUNT"
        action={
          <AddButton
            open={adding === "habit"}
            onClick={() => setAdding((a) => (a === "habit" ? null : "habit"))}
          />
        }
      />
      {adding === "habit" && (
        <AddForm
          fields={[
            { key: "name", label: "Habit", kind: "text", value: "" },
            { key: "goal", label: "Goal", kind: "number", value: "1" },
            { key: "unit", label: "Unit", kind: "text", value: "" },
          ]}
          onSubmit={(v) => {
            if (!v.name.trim()) return;
            setAdding(null);
            void send("/api/daily/habits", {
              method: "POST",
              body: JSON.stringify({
                name: v.name,
                goal: Number(v.goal) || 1,
                unit: v.unit || undefined,
              }),
            });
          }}
        />
      )}
      {habits.length === 0 ? (
        <p className="mb-[30px] text-[13px] text-faint">No habits yet.</p>
      ) : (
        <div className="mb-[30px] grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {habits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => tapHabit(h)}
              className="flex min-w-0 items-center gap-[13px] rounded-[18px] border border-edge p-[15px] text-left transition-colors hover:border-ink"
              style={{ background: h.met ? `${h.color}22` : "var(--color-surf)" }}
            >
              <svg
                width="44"
                height="44"
                viewBox="0 0 100 100"
                className="shrink-0 -rotate-90"
                aria-hidden
              >
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="var(--color-ring-track)"
                  strokeWidth="13"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={h.color}
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeDasharray={`${((2 * Math.PI * 40 * h.pct) / 100).toFixed(1)} ${(
                    2 *
                    Math.PI *
                    40
                  ).toFixed(1)}`}
                />
              </svg>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold tracking-[-0.01em]">{h.name}</div>
                <Mono className="mt-[5px] block text-[10px] text-dim">{h.count}</Mono>
                <Mono className="mt-[3px] block text-[9px] text-faint">
                  {h.unit ?? ""}
                  {h.streak > 0 ? `${h.unit ? " · " : ""}${h.streak}D STREAK` : ""}
                </Mono>
              </div>
            </button>
          ))}
        </div>
      )}

      <Rule
        label="RHYTHMS — THIS WEEK"
        action={
          <AddButton
            open={adding === "rhythm"}
            onClick={() => setAdding((a) => (a === "rhythm" ? null : "rhythm"))}
          />
        }
      />
      {adding === "rhythm" && (
        <AddForm
          fields={[
            { key: "name", label: "Rhythm", kind: "text", value: "" },
            { key: "per", label: "Per week", kind: "number", value: "1" },
          ]}
          onSubmit={(v) => {
            if (!v.name.trim()) return;
            setAdding(null);
            void send("/api/daily/rhythms", {
              method: "POST",
              body: JSON.stringify({ name: v.name, per: Number(v.per) || 1 }),
            });
          }}
        />
      )}
      {rhythms.length === 0 ? (
        <p className="mb-[30px] text-[13px] text-faint">No rhythms yet.</p>
      ) : (
        <div className="mb-[30px] overflow-hidden rounded-[18px] border border-edge bg-surf">
          {rhythms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => tapRhythm(r)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3.5 border-b border-edge2 px-[18px] py-3.5 text-left transition-colors last:border-b-0 hover:bg-bg"
              style={{ background: r.behind ? "var(--color-wait-tint)" : undefined }}
            >
              <div className="min-w-0">
                <div
                  className="text-[14px] font-medium tracking-[-0.01em]"
                  style={{ color: r.behind ? "var(--color-wait-ink)" : "var(--color-ink)" }}
                >
                  {r.name}
                </div>
                <Mono className="mt-[5px] block text-[9.5px] text-faint">
                  {r.perLabel}
                  {r.met ? " · DONE" : ` · ${r.left} LEFT`}
                </Mono>
              </div>
              <div className="flex gap-1">
                {r.pips.map((fill, i) => (
                  <span
                    key={i}
                    className="h-[9px] w-[9px] rounded-[3px]"
                    style={{ background: fill }}
                  />
                ))}
              </div>
              <Mono className="min-w-[32px] text-right text-[10px] text-dim">{r.label}</Mono>
            </button>
          ))}
        </div>
      )}

      <div className="mb-[30px] grid grid-cols-1 gap-[11px] md:grid-cols-2">
        <div className="min-w-0 rounded-[18px] border border-edge bg-surf px-5 py-[18px]">
          <div className="mb-1.5 flex items-baseline gap-2.5">
            <span className="text-[14.5px] font-semibold tracking-[-0.02em]">Meal prep</span>
            <div className="flex-1" />
            <Mono className="text-[10px] text-dim">{mealsLeftTotal} SERVINGS LEFT</Mono>
            <AddButton
              open={adding === "meal"}
              onClick={() => setAdding((a) => (a === "meal" ? null : "meal"))}
            />
          </div>
          <Mono className="mb-4 block text-[9.5px] text-faint">TAP A DISH TO EAT A SERVING</Mono>
          {adding === "meal" && (
            <AddForm
              fields={[
                { key: "name", label: "Dish", kind: "text", value: "" },
                { key: "servings", label: "Servings", kind: "number", value: "2" },
              ]}
              onSubmit={(v) => {
                if (!v.name.trim()) return;
                setAdding(null);
                void send("/api/daily/meals", {
                  method: "POST",
                  body: JSON.stringify({ name: v.name, servings: Number(v.servings) || 0 }),
                });
              }}
            />
          )}
          {meals.length === 0 ? (
            <p className="m-0 text-[13px] text-faint">Nothing prepped.</p>
          ) : (
            <div className="flex flex-col gap-[9px]">
              {meals.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => tapMeal(m)}
                  disabled={m.gone}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-0.5 text-left disabled:cursor-default"
                >
                  <span
                    className="min-w-0 truncate text-[13.5px]"
                    style={{ color: m.gone ? "var(--color-faint)" : "var(--color-ink)" }}
                  >
                    {m.name}
                  </span>
                  <div className="flex gap-1">
                    {m.pips.map((on, i) => (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full"
                        style={{ background: on ? "#63b894" : "var(--color-edge)" }}
                      />
                    ))}
                  </div>
                  <Mono className="min-w-[44px] text-right text-[9.5px] text-faint">{m.left}</Mono>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-[18px] border border-edge bg-surf px-5 py-[18px]">
          <div className="mb-4 flex items-baseline gap-2.5">
            <span className="text-[14.5px] font-semibold tracking-[-0.02em]">Groceries</span>
            <div className="flex-1" />
            <Mono className="text-[10px] text-dim">{groceryLeft} LEFT</Mono>
            <AddButton
              open={adding === "grocery"}
              onClick={() => setAdding((a) => (a === "grocery" ? null : "grocery"))}
            />
          </div>
          {adding === "grocery" && (
            <AddForm
              fields={[
                { key: "name", label: "Item", kind: "text", value: "" },
                { key: "cat", label: "Category", kind: "text", value: "" },
              ]}
              onSubmit={(v) => {
                if (!v.name.trim()) return;
                setAdding(null);
                void send("/api/daily/groceries", {
                  method: "POST",
                  body: JSON.stringify({ name: v.name, cat: v.cat || "Other" }),
                });
              }}
            />
          )}
          {groups.length === 0 ? (
            <p className="m-0 text-[13px] text-faint">The list is empty.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g.cat}>
                  <Mono className="mb-[9px] block text-[9px] tracking-[0.12em] text-faint">
                    {g.cat.toUpperCase()}
                  </Mono>
                  <div className="flex flex-col gap-2">
                    {g.items.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => tapGrocery(i.id, i.got)}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <Tick done={i.got} color="#63b894" size={14} />
                        <span
                          className="text-[13px]"
                          style={{
                            color: i.got ? "var(--color-faint)" : "var(--color-ink)",
                            textDecoration: i.got ? "line-through" : "none",
                          }}
                        >
                          {i.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {groceryLeft < groups.reduce((a, g) => a + g.items.length, 0) && (
                <button
                  type="button"
                  onClick={() => void send("/api/daily/groceries", { method: "DELETE" })}
                  className="self-start"
                >
                  <Mono className="text-[9px] tracking-[0.14em] text-faint transition-colors hover:text-ink">
                    CLEAR BOUGHT
                  </Mono>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
