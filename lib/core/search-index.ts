import fs from "node:fs/promises";
import path from "node:path";
import type { Charter, ProjectType, SearchItem } from "./types";
import { BODY_CAP } from "./tokens";
import { dataRoot, journalPath } from "./paths";
import { listCharters, listTasks } from "./store";
import { listNotes } from "./knowledge";
import { listDetailIds, readDetail } from "./details";
import { listCommentedIds, readComments } from "./comments";
import { listEvents } from "./calendar";
import { getDaily } from "./daily";
import { readJournal } from "./journal";

export const FRESH_MS = 3_000;
export const MAX_AGE_MS = 60_000;
export const JOURNAL_DAYS = 60;

function cap(text: string | null | undefined): string {
  const body = (text ?? "").trim();
  return body.length > BODY_CAP ? body.slice(0, BODY_CAP) : body;
}

function titleOr(text: string | null | undefined, fallback: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t || fallback;
}

function isoToday(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

async function notesItems(): Promise<SearchItem[]> {
  const notes = await listNotes();
  return notes.map((n) => ({
    kind: "note" as const,
    key: `note:${n.id}`,
    title: titleOr(n.title, n.id),
    subtitle: n.summary,
    body: cap(n.body),
    tags: n.tags,
    updated: n.updated,
  }));
}

function charterItem(c: Charter): SearchItem {
  return {
    kind: "charter",
    key: `charter:${c.type}/${c.id}`,
    title: titleOr(c.name, c.id),
    subtitle: c.type === "area" ? "Area" : "Project",
    body: cap([c.why, ...c.mvpScope].join("\n")),
    tags: [],
    updated: c.updated,
    type: c.type,
    slug: c.id,
  };
}

async function charterItems(c: Charter): Promise<SearchItem[]> {
  const type: ProjectType = c.type;
  const slug = c.id;
  const name = c.name;
  const out: SearchItem[] = [];
  const titles = new Map<string, string>();

  try {
    for (const t of await listTasks(type, slug)) {
      titles.set(t.id, t.title);
      out.push({
        kind: "task",
        key: `task:${type}/${slug}/${t.id}`,
        title: titleOr(t.title, t.id),
        subtitle: `${name} · ${t.id}`,
        body: "",
        tags: [],
        updated: t.doneDate ?? t.created ?? c.updated,
        type,
        slug,
        taskId: t.id,
      });
    }
  } catch {
    // One unparseable tasks.md costs this charter's tasks, never the query.
  }

  try {
    for (const id of await listDetailIds(type, slug)) {
      const body = await readDetail(type, slug, id);
      if (!body || !body.trim()) continue;
      out.push({
        kind: "description",
        key: `description:${type}/${slug}/${id}`,
        title: titleOr(titles.get(id), id),
        subtitle: `${name} · ${id}`,
        body: cap(body),
        tags: [],
        updated: c.updated,
        type,
        slug,
        taskId: id,
      });
    }
  } catch {
    // Same rule: a slice, not the index.
  }

  try {
    for (const id of await listCommentedIds(type, slug)) {
      for (const e of await readComments(type, slug, id)) {
        if (!e.body.trim()) continue;
        out.push({
          kind: "log",
          key: `log:${type}/${slug}/${id}/${e.date} ${e.time}`,
          title: titleOr(titles.get(id), id),
          subtitle: `${name} · ${id} · ${e.date}`,
          body: cap(e.body),
          tags: [],
          updated: e.date,
          type,
          slug,
          taskId: id,
        });
      }
    }
  } catch {
    // Same rule.
  }

  return out;
}

async function eventItems(): Promise<SearchItem[]> {
  const events = await listEvents();
  return events.map((e) => ({
    kind: "event" as const,
    key: `event:${e.id}`,
    title: titleOr(e.title, e.id),
    subtitle: `${e.date}${e.time ? ` ${e.time}` : ""}`,
    body: cap([e.note, e.action].filter(Boolean).join(" ")),
    tags: [],
    updated: e.date,
    date: e.date,
  }));
}

async function dailyItems(): Promise<SearchItem[]> {
  const daily = await getDaily();
  const out: SearchItem[] = [];
  // A routine has no date of its own; "" sorts it last on the `updated`
  // tiebreak, which is where an undated row belongs.
  for (const h of daily.habits) {
    out.push({
      kind: "habit",
      key: `habit:${h.id}`,
      title: titleOr(h.name, h.id),
      subtitle: `Habit · goal ${h.goal}${h.unit ? ` ${h.unit}` : ""}`,
      body: "",
      tags: [],
      updated: "",
    });
  }
  for (const r of daily.rhythms) {
    out.push({
      kind: "rhythm",
      key: `rhythm:${r.id}`,
      title: titleOr(r.name, r.id),
      subtitle: `Rhythm · ${r.per}× a week`,
      body: "",
      tags: [],
      updated: "",
    });
  }
  for (const m of daily.meals) {
    out.push({
      kind: "meal",
      key: `meal:${m.id}`,
      title: titleOr(m.name, m.id),
      subtitle: `Meal · ${m.servings} left`,
      body: "",
      tags: [],
      updated: "",
    });
  }
  for (const g of daily.groceries) {
    out.push({
      kind: "grocery",
      key: `grocery:${g.id}`,
      title: titleOr(g.name, g.id),
      subtitle: `Grocery · ${g.cat}`,
      body: "",
      tags: [],
      updated: "",
    });
  }
  return out;
}

async function journalItems(): Promise<SearchItem[]> {
  const days = await readJournal(JOURNAL_DAYS);
  const out: SearchItem[] = [];
  for (const day of days) {
    day.entries.forEach((e, i) => {
      out.push({
        kind: "journal",
        key: `journal:${day.date}/${i}`,
        title: titleOr(e.message, day.date),
        subtitle: `${day.date} ${e.time} · ${e.scope}`,
        body: "",
        tags: [],
        updated: day.date,
        date: day.date,
      });
    });
  }
  return out;
}

async function collect(
  out: SearchItem[],
  source: () => Promise<SearchItem[]>,
): Promise<void> {
  try {
    out.push(...(await source()));
  } catch {
    // A source that cannot be read drops out of this build. The index is
    // derived state read on every keystroke: one unparseable file must not
    // 500 every query, which is a deliberate departure from the
    // stop-the-world contract `parseTasks` holds on the charter page.
  }
}

export async function buildSearchIndex(): Promise<SearchItem[]> {
  const items: SearchItem[] = [];

  await collect(items, notesItems);

  let charters: Charter[] = [];
  try {
    charters = await listCharters();
  } catch {
    charters = [];
  }
  for (const c of charters) {
    try {
      items.push(charterItem(c));
      items.push(...(await charterItems(c)));
    } catch {
      continue;
    }
  }

  await collect(items, eventItems);
  await collect(items, dailyItems);
  await collect(items, journalItems);

  return items;
}

let cache: SearchItem[] | null = null;
let builtAt = 0;
let stamp = "";
let inFlight: Promise<SearchItem[]> | null = null;

/**
 * Two stats stand in for the whole tree. Every `lib/core` write — from this
 * process or from the MCP server, which has its own module scope — ends in
 * `appendJournal` and `commitData`, and `git add -A` touches `.git/index`.
 * A hand edit in a markdown editor touches neither, which is what
 * `MAX_AGE_MS` is for.
 */
async function currentStamp(): Promise<string> {
  const files = [journalPath(isoToday()), path.join(dataRoot(), ".git", "index")];
  const parts: string[] = [];
  for (const file of files) {
    try {
      const s = await fs.stat(file);
      parts.push(`${s.mtimeMs}:${s.size}`);
    } catch {
      parts.push("-");
    }
  }
  return parts.join("|");
}

export async function getSearchIndex(): Promise<SearchItem[]> {
  const age = Date.now() - builtAt;
  if (cache && age < FRESH_MS) return cache;
  if (cache && age < MAX_AGE_MS) {
    const now = await currentStamp();
    if (now === stamp) {
      builtAt = Date.now();
      return cache;
    }
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Stamped before the build, so a write landing mid-build is seen as a
      // change next time rather than being swallowed until MAX_AGE_MS.
      const next = await currentStamp();
      const items = await buildSearchIndex();
      cache = items;
      stamp = next;
      builtAt = Date.now();
      return items;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Tests only. Writers must not call this — see the spec's caching section. */
export function invalidateSearchIndex(): void {
  cache = null;
  builtAt = 0;
  stamp = "";
  inFlight = null;
}
