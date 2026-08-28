import { getAbout, getCharter, listTasks } from "../core/store";
import { readJournal } from "../core/journal";
import { listEvents } from "../core/calendar";
import { countIn, countOnDay, getDaily } from "../core/daily";
import { knowledgeSection } from "../core/knowledge";
import { isoToday, weekRange } from "../ui/momentum";
import type { Task } from "../core/types";
import { CHAT_MODES, type ChatMode } from "./modes";

function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done && t.section !== "done");
}

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv").slice(0, 10);
}

async function calendarSection(): Promise<string> {
  const events = await listEvents({ from: isoShift(0), to: isoShift(14) });
  const open = events.filter((e) => !e.done);
  const lines = open.map((e) => {
    const bits = [e.time ? `at ${e.time}` : null, e.scope ? `scope ${e.scope}` : null]
      .filter(Boolean)
      .join(", ");
    const tail = [bits ? `(${bits})` : null, e.note ? `note: ${e.note}` : null, e.action ? `ACTION NEEDED: ${e.action}` : null]
      .filter(Boolean)
      .join(" — ");
    return `- ${e.date} ${e.id} ${e.title}${tail ? ` ${tail}` : ""}`;
  });
  const body = lines.length ? lines.join("\n") : "(no events)";
  return `\n\n# Calendar (next 14 days)\n${body}`;
}

async function dailySection(): Promise<string> {
  const data = await getDaily();
  if (!data.habits.length && !data.rhythms.length && !data.meals.length && !data.groceries.length) {
    return "";
  }
  const today = isoToday();
  const week = weekRange(today);
  const under = data.habits
    .map((h) => ({ h, n: countOnDay(data.log, h.id, today) }))
    .filter((r) => r.n < r.h.goal);
  const behind = data.rhythms
    .map((r) => ({ r, n: countIn(data.log, r.id, week.start, week.end) }))
    .filter((row) => row.n < row.r.per);
  const servings = data.meals.reduce((a, m) => a + m.servings, 0);
  const groceries = data.groceries.filter((g) => !g.got).length;
  const lines = [
    under.length
      ? `Habits under goal today: ${under.map((r) => `${r.h.id} ${r.h.name} ${r.n}/${r.h.goal}`).join(", ")}`
      : "All habits met today.",
    behind.length
      ? `Rhythms behind this week: ${behind.map((row) => `${row.r.id} ${row.r.name} ${row.n}/${row.r.per}`).join(", ")}`
      : "All rhythms met this week.",
    `${servings} servings prepped, ${groceries} groceries left to buy.`,
  ];
  return `\n\n# Daily\n${lines.join("\n")}`;
}

export async function buildSystemContext(
  focus?: { type: "project" | "area"; slug: string },
  mode?: ChatMode,
): Promise<string> {
  const about = await getAbout();
  const parts: string[] = [];

  if (mode && CHAT_MODES[mode]) {
    parts.push(`# Mode: ${CHAT_MODES[mode].label}
${CHAT_MODES[mode].instruction}
`);
  }

  parts.push("# About\n");
  parts.push(about.trim() || "(no about.md content)");
  parts.push(await calendarSection());
  parts.push(await dailySection());

  if (!focus || !focus.slug) {
    parts.push(await knowledgeSection());
    parts.push(
      "\n\n# Focus\nNo project is currently focused. Ask the user which project or area to focus on, or use listProjects/listAreas to suggest one.",
    );
    return parts.join("\n");
  }

  const focusScope = focus.type === "area" ? `area:${focus.slug}` : focus.slug;
  parts.push(await knowledgeSection(focusScope));

  let charter;
  try {
    charter = await getCharter(focus.type, focus.slug);
  } catch {
    parts.push(`\n\n# Focus\nFocused charter not found: ${focus.type}/${focus.slug}.`);
    return parts.join("\n");
  }

  parts.push(`\n\n# Focused ${focus.type}: ${charter.name} (${focus.slug})\n`);
  parts.push(`Status: ${charter.status} | Priority: ${charter.priority}`);
  if (charter.mvp) parts.push(`MVP: ${charter.mvp}`);
  parts.push(`\n## Why\n${charter.why.trim() || "(none)"}`);

  if (focus.type === "project") {
    parts.push(
      `\n## MVP scope\n` +
        (charter.mvpScope.length ? charter.mvpScope.map((s) => `- ${s}`).join("\n") : "(none)"),
    );
  }

  parts.push(
    `\n## Parking lot\n` +
      (charter.parkingLot.length ? charter.parkingLot.map((s) => `- ${s}`).join("\n") : "(none)"),
  );

  const tasks = await listTasks(focus.type, focus.slug);
  const open = openTasks(tasks);
  parts.push(
    `\n## Open tasks (${open.length})\n` +
      (open.length
        ? open.map((t) => `- [${t.section}] ${t.id} ${t.title} (${t.size})`).join("\n")
        : "(none)"),
  );

  const days = await readJournal(7);
  const digest = days
    .map(
      (d) =>
        `### ${d.date}\n` + d.entries.map((e) => `- ${e.time} [${e.scope}] ${e.message}`).join("\n"),
    )
    .join("\n\n");
  parts.push(`\n# Journal (last 7 days)\n` + (digest || "(none)"));

  return parts.join("\n");
}
