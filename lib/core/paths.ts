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
export function journalPath(date: string) { return path.join(dataRoot(), "journal", `${date}.md`); }
export function aboutPath() { return path.join(dataRoot(), "about.md"); }
export function providersPath() { return path.join(dataRoot(), "providers.json"); }
