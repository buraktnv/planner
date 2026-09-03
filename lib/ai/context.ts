import { getAbout, getCharter, listTasks } from "../core/store";
import { readJournal } from "../core/journal";
import { listEvents } from "../core/calendar";
import { daysUntil, isSurfaced, nextOccurrence } from "../core/recurrence";
import { countIn, countOnDay, getDaily } from "../core/daily";
import { knowledgeSection } from "../core/knowledge";
import { isoToday, weekRange } from "../ui/momentum";
import type { Task } from "../core/types";
import { CHAT_MODES, type ChatMode } from "./modes";
import { renderRevisePrompt, type RevisePayload } from "./revise";

const CALENDAR_DAYS = 14;

function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done && t.section !== "done");
}

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv").slice(0, 10);
}

async function calendarSection(): Promise<string> {
  const today = isoShift(0);
  const horizon = isoShift(CALENDAR_DAYS);
  const upcoming = (await listEvents())
    .filter((e) => !e.done)
    .map((e) => ({ e, occurs: nextOccurrence(e, today) }))
    .filter(({ e, occurs }) => (occurs >= today && occurs <= horizon) || isSurfaced(e, today))
    .sort((a, b) => a.occurs.localeCompare(b.occurs) || a.e.id.localeCompare(b.e.id));
  const lines = upcoming.map(({ e, occurs }) => {
    const bits = [e.time ? `at ${e.time}` : null, e.scope ? `scope ${e.scope}` : null, e.repeat ?? null]
      .filter(Boolean)
      .join(", ");
    const tail = [bits ? `(${bits})` : null, e.note ? `note: ${e.note}` : null, e.action ? `ACTION NEEDED: ${e.action}` : null]
      .filter(Boolean)
      .join(" — ");
    const days = daysUntil(occurs, today);
    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    return `- ${occurs} (${when}) ${e.id} ${e.title}${tail ? ` ${tail}` : ""}`;
  });
  const body = lines.length ? lines.join("\n") : "(no events)";
  return `\n\n# Calendar (next ${CALENDAR_DAYS} days, plus anything inside its lead window)\n${body}`;
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

const CAPTURE_INSTRUCTION = `# Capture
When the user states something durable about themselves — a health fact, a financial situation, a constraint, a preference, a decision, how they work — call add_note once with a single-line summary and no scope. It is categorised automatically. Keep it to one line; omit the title and the body.
Do not capture: anything task-shaped (that is a task), anything transient (today's mood, what they just ate), anything already listed in the Knowledge block above, or anything they are merely asking about rather than stating.
File at most two notes per reply, and never mention that you are doing it.`;

/**
 * Appended last, for recency, and only on a revise turn. It lives here rather
 * than in a mode instruction because modes are optional and only `plan` carries
 * the batching rule — a revise from Reflect, or from no mode at all, would get
 * nothing. Both provider paths call this function, so this is the one edit that
 * reaches both models.
 */
function finish(parts: string[], revise?: RevisePayload): string {
  if (revise) parts.push(`\n\n${renderRevisePrompt(revise)}`);
  return parts.join("\n");
}

export async function buildSystemContext(
  focus?: { type: "project" | "area"; slug: string },
  mode?: ChatMode,
  query?: string,
  revise?: RevisePayload,
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
    parts.push(await knowledgeSection(undefined, query));
    parts.push(`\n\n${CAPTURE_INSTRUCTION}`);
    parts.push(
      "\n\n# Focus\nNo project is currently focused. Ask the user which project or area to focus on, or use listProjects/listAreas to suggest one.",
    );
    return finish(parts, revise);
  }

  const focusScope = focus.type === "area" ? `area:${focus.slug}` : focus.slug;
  parts.push(await knowledgeSection(focusScope, query));
  parts.push(`\n\n${CAPTURE_INSTRUCTION}`);

  let charter;
  try {
    charter = await getCharter(focus.type, focus.slug);
  } catch {
    parts.push(`\n\n# Focus\nFocused charter not found: ${focus.type}/${focus.slug}.`);
    return finish(parts, revise);
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

  return finish(parts, revise);
}
