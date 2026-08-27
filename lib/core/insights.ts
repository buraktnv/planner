import { listCharters, listTasks } from "./store";

export interface Insights {
  weeks: { weekStart: string; done: number; created: number }[];
  perProject: { slug: string; name: string; type: "project" | "area"; open: number; doneTotal: number; lastActivity: string | null }[];
  stalled: { slug: string; name: string; days: number }[];
  balance: { projects: number; areas: number };
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - diff);
  return c;
}

function dateInRange(s: string, since: Date, until: Date): boolean {
  const d = parseLocalDate(s);
  return d >= since && d <= until;
}

export async function getInsights(now: Date = new Date()): Promise<Insights> {
  const charters = await listCharters();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const currentMonday = mondayOf(now);
  const weeks: { weekStart: string; done: number; created: number }[] = [];
  const weekIndex = new Map<string, number>();
  for (let i = 7; i >= 0; i--) {
    const m = new Date(currentMonday);
    m.setDate(m.getDate() - i * 7);
    const key = isoLocal(m);
    weekIndex.set(key, weeks.length);
    weeks.push({ weekStart: key, done: 0, created: 0 });
  }

  const since30 = new Date(todayDate);
  since30.setDate(since30.getDate() - 30);

  const perProject: Insights["perProject"] = [];
  const stalled: Insights["stalled"] = [];
  let balanceProjects = 0;
  let balanceAreas = 0;

  for (const c of charters) {
    const tasks = await listTasks(c.type, c.id);
    let open = 0;
    let doneTotal = 0;
    let lastActivity: string | null = null;

    for (const t of tasks) {
      if (t.done) {
        doneTotal++;
        if (t.doneDate) {
          const wkKey = isoLocal(mondayOf(parseLocalDate(t.doneDate)));
          const idx = weekIndex.get(wkKey);
          if (idx !== undefined) weeks[idx].done++;
          if (dateInRange(t.doneDate, since30, todayDate)) {
            if (c.type === "project") balanceProjects++;
            else balanceAreas++;
          }
        }
      } else {
        open++;
      }
      if (t.created) {
        const wkKey = isoLocal(mondayOf(parseLocalDate(t.created)));
        const idx = weekIndex.get(wkKey);
        if (idx !== undefined) weeks[idx].created++;
      }
      for (const d of [t.created, t.doneDate]) {
        if (d && (lastActivity === null || d > lastActivity)) lastActivity = d;
      }
    }

    perProject.push({
      slug: c.id,
      name: c.name,
      type: c.type,
      open,
      doneTotal,
      lastActivity,
    });

    if (c.status === "active") {
      let last = lastActivity;
      if (last === null) last = c.created;
      const lastDate = parseLocalDate(last);
      const days = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);
      if (days > 14) {
        stalled.push({ slug: c.id, name: c.name, days });
      }
    }
  }

  return {
    weeks,
    perProject,
    stalled,
    balance: { projects: balanceProjects, areas: balanceAreas },
  };
}
