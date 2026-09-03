import { getAbout, getCharter, listCharters, listTasks } from "../core/store";
import { readJournal, type JournalDay } from "../core/journal";
import { listEvents } from "../core/calendar";
import { daysUntil, isSurfaced, nextOccurrence } from "../core/recurrence";
import { countIn, countOnDay, getDaily } from "../core/daily";
import { habitTrends, renderTrendsDigest, rhythmTrends, TREND_WEEKS } from "../core/trends";
import { rankOpenTasks } from "../core/next";
import { knowledgeSection } from "../core/knowledge";
import { isoToday, weekRange } from "../ui/momentum";
import { CHAT_MODES, type ChatMode } from "./modes";
import { renderRevisePrompt, type RevisePayload } from "./revise";
import { renderDigest } from "./digest";

const CALENDAR_DAYS = 14;
export const JOURNAL_LINE_CAP = 40;
export const OPEN_TASK_CAP = 30;
export const LIFE_SECTION_MAX_CHARS = 4000;

/**
 * The most recent `cap` journal lines, oldest first so the model reads the
 * week in order, with a count of what was cut. Every journal line used to go
 * in verbatim, and a busy week of canvas moves is hundreds of them.
 */
export function journalBlock(days: JournalDay[], cap = JOURNAL_LINE_CAP): string {
  const flat: { date: string; line: string }[] = [];
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of d.entries) flat.push({ date: d.date, line: `- ${e.time} [${e.scope}] ${e.message}` });
  }
  if (flat.length === 0) return "(none)";
  const cut = Math.max(0, flat.length - cap);
  const kept = flat.slice(cut);
  const out: string[] = [];
  if (cut > 0) out.push(`(+${cut} earlier ${cut === 1 ? "line" : "lines"} this week)`);
  let current = "";
  for (const row of kept) {
    if (row.date !== current) {
      current = row.date;
      out.push(`### ${row.date}`);
    }
    out.push(row.line);
  }
  return out.join("\n");
}

async function areasLine(): Promise<string> {
  const areas = await listCharters("area");
  if (areas.length === 0) return "";
  return `\n\nAreas: ${areas.map((a) => `area:${a.id} (${a.name})`).join(", ")}`;
}

/**
 * Only the unfocused chat gets this, and it is the one that used to see
 * nothing of the user's week: the journal lived inside the focused branch, so
 * "how has my week been?" was answered from About and a habit count for today.
 */
async function lifeSection(): Promise<string> {
  const today = isoToday();
  const [data, days] = await Promise.all([getDaily(), readJournal(7)]);
  const trends = renderTrendsDigest({
    habits: habitTrends(data, today),
    rhythms: rhythmTrends(data, today),
  });
  if (!trends && days.length === 0) return "";
  const trendsBlock = trends
    ? `\n\n## Habits and rhythms (last ${TREND_WEEKS} weeks, current week starred)\n${trends}`
    : "";
  let cap = JOURNAL_LINE_CAP;
  let journal = journalBlock(days, cap);
  while (cap > 5 && journal.length + trendsBlock.length > LIFE_SECTION_MAX_CHARS) {
    cap = Math.floor(cap / 2);
    journal = journalBlock(days, cap);
  }
  return `\n\n# Life\n## Journal (last 7 days)\n${journal}${trendsBlock}`;
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
File at most two notes per reply (the closing reply of a check-in may file three, each with an explicit area scope), and never mention that you are doing it.`;

/**
 * Appended last, for recency, and only on a revise turn. It lives here rather
 * than in a mode instruction because modes are optional and only `plan` carries
 * the batching rule — a revise from Reflect, or from no mode at all, would get
 * nothing. Both provider paths call this function, so this is the one edit that
 * reaches both models.
 */
function finish(parts: string[], revise?: RevisePayload, digest?: string): string {
  if (digest) parts.push(`\n\n${renderDigest(digest)}`);
  if (revise) parts.push(`\n\n${renderRevisePrompt(revise)}`);
  return parts.join("\n");
}

export async function buildSystemContext(
  focus?: { type: "project" | "area"; slug: string },
  mode?: ChatMode,
  query?: string,
  revise?: RevisePayload,
  digest?: string,
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
    parts.push(await lifeSection());
    parts.push(await knowledgeSection(undefined, query));
    parts.push(await areasLine());
    parts.push(`\n\n${CAPTURE_INSTRUCTION}`);
    parts.push(
      "\n\n# Focus\nNo project is currently focused. Ask the user which project or area to focus on, or use listProjects/listAreas to suggest one.",
    );
    return finish(parts, revise, digest);
  }

  const focusScope = focus.type === "area" ? `area:${focus.slug}` : focus.slug;
  parts.push(await knowledgeSection(focusScope, query));
  parts.push(await areasLine());
  parts.push(`\n\n${CAPTURE_INSTRUCTION}`);

  let charter;
  try {
    charter = await getCharter(focus.type, focus.slug);
  } catch {
    parts.push(`\n\n# Focus\nFocused charter not found: ${focus.type}/${focus.slug}.`);
    return finish(parts, revise, digest);
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
  const open = rankOpenTasks(tasks, charter);
  const shown = open.slice(0, OPEN_TASK_CAP);
  const more = open.length - shown.length;
  parts.push(
    `\n## Open tasks (${open.length})\n` +
      (shown.length
        ? shown.map((t) => `- [${t.section}] ${t.id} ${t.title} (${t.size})`).join("\n") +
          (more > 0 ? `\n(+${more} more — ask next_actions or get_context for the rest)` : "")
        : "(none)"),
  );

  parts.push(`\n# Journal (last 7 days)\n${journalBlock(await readJournal(7))}`);

  return finish(parts, revise, digest);
}
