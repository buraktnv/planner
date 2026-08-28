import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { dataRoot } from "./paths";

const STALE_MS = 30_000;
const RETRY_MS = 40;
const MAX_WAIT_MS = 20_000;

let tail: Promise<unknown> = Promise.resolve();

export function lockPathFor(root: string): string {
  const key = crypto
    .createHash("sha1")
    .update(path.resolve(root).replace(/\\/g, "/").toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `planner-lock-${key}`);
}

async function acquire(dir: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await fs.mkdir(dir);
      return;
    } catch {
      try {
        const stat = await fs.stat(dir);
        if (Date.now() - stat.mtimeMs > STALE_MS) {
          await fs.rmdir(dir).catch(() => {});
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > MAX_WAIT_MS) {
        throw new Error(`Timed out waiting for the planner data lock at ${dir}`);
      }
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

async function release(dir: string): Promise<void> {
  await fs.rmdir(dir).catch(() => {});
}

export async function withDataLock<T>(run: () => Promise<T>): Promise<T> {
  const next = tail.then(
    () => guarded(run),
    () => guarded(run),
  );
  tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  const dir = lockPathFor(dataRoot());
  await acquire(dir);
  try {
    return await run();
  } finally {
    await release(dir);
  }
}
