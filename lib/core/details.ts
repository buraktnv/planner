import fs from "node:fs/promises";
import path from "node:path";
import { detailPath, detailsDir } from "./paths";
import { appendJournal } from "./journal";
import { commitData } from "./git";
import { withDataLock } from "./locks";
import type { ProjectType } from "./types";

const TASK_ID = /^T-\d+(\.\d+)*$/;

export function assertTaskId(taskId: string): string {
  if (typeof taskId !== "string" || !TASK_ID.test(taskId)) {
    throw new Error(`Invalid task id: ${String(taskId)}`);
  }
  return taskId;
}

export async function readDetail(
  type: ProjectType,
  slug: string,
  taskId: string,
): Promise<string | null> {
  assertTaskId(taskId);
  try {
    return await fs.readFile(detailPath(type, slug, taskId), "utf8");
  } catch {
    return null;
  }
}

export async function listDetailIds(type: ProjectType, slug: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(detailsDir(type, slug));
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".md"))
    .map((n) => n.slice(0, -3))
    .filter((id) => TASK_ID.test(id));
}

export async function writeDetail(
  type: ProjectType,
  slug: string,
  taskId: string,
  body: string,
): Promise<void> {
  assertTaskId(taskId);
  return withDataLock(async () => {
    const file = detailPath(type, slug, taskId);
    const trimmed = body.trim();
    if (trimmed === "") {
      try {
        await fs.unlink(file);
      } catch {
        return;
      }
      await appendJournal(slug, `${taskId} detail cleared`);
      await commitData(`task detail cleared: ${taskId} (${slug})`);
      return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${trimmed}\n`, "utf8");
    await appendJournal(slug, `${taskId} detail updated`);
    await commitData(`task detail updated: ${taskId} (${slug})`);
  });
}
