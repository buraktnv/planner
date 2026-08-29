import path from "node:path";

export function dataRoot(): string {
  const dir = process.env.PLANNER_DATA_DIR;
  return dir ? dir : path.resolve(process.cwd(), "..", "planner-data");
}

export function projectsDir() { return path.join(dataRoot(), "projects"); }
export function areasDir() { return path.join(dataRoot(), "areas"); }
export function charterPath(type: "project" | "area", slug: string) {
  return path.join(type === "project" ? projectsDir() : areasDir(), `${slug}.md`);
}
export function tasksPath(type: "project" | "area", slug: string) {
  return path.join(type === "project" ? projectsDir() : areasDir(), slug, "tasks.md");
}
export function detailsDir(type: "project" | "area", slug: string) {
  return path.join(type === "project" ? projectsDir() : areasDir(), slug, "details");
}
export function detailPath(type: "project" | "area", slug: string, taskId: string) {
  return path.join(detailsDir(type, slug), `${taskId}.md`);
}
export function archiveDir(type?: "project" | "area") {
  const base = path.join(dataRoot(), "archive");
  if (!type) return base;
  return path.join(base, type === "project" ? "projects" : "areas");
}
export function dailyDir() { return path.join(dataRoot(), "daily"); }
export function habitsPath() { return path.join(dailyDir(), "habits.md"); }
export function rhythmsPath() { return path.join(dailyDir(), "rhythms.md"); }
export function mealsPath() { return path.join(dailyDir(), "meals.md"); }
export function groceriesPath() { return path.join(dailyDir(), "groceries.md"); }
export function dailyLogPath() { return path.join(dailyDir(), "log.md"); }
export function journalPath(date: string) { return path.join(dataRoot(), "journal", `${date}.md`); }
export function calendarPath() { return path.join(dataRoot(), "calendar.md"); }
export function aboutPath() { return path.join(dataRoot(), "about.md"); }
export function providersPath() { return path.join(dataRoot(), "providers.json"); }
export function knowledgeDir() { return path.join(dataRoot(), "knowledge"); }
export function knowledgeIndexPath() { return path.join(knowledgeDir(), "index.md"); }
