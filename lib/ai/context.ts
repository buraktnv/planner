import { getAbout, getCharter, listTasks } from "../core/store";
import { readJournal } from "../core/journal";
import type { Task } from "../core/types";

function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done && t.section !== "done");
}

export async function buildSystemContext(focus?: { type: "project" | "area"; slug: string }): Promise<string> {
  const about = await getAbout();
  const parts: string[] = [];

  parts.push("# About\n");
  parts.push(about.trim() || "(no about.md content)");

  if (!focus || !focus.slug) {
    parts.push(
      "\n\n# Focus\nNo project is currently focused. Ask the user which project or area to focus on, or use listProjects/listAreas to suggest one.",
    );
    return parts.join("\n");
  }

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
