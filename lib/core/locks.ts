import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { dataRoot } from "./paths";

/**
 * A lock is only assumed abandoned after this long with no heartbeat. The
 * holder refreshes it every `BEAT_MS`, so this measures "the process died",
 * not "the write is slow" — before the heartbeat, a git commit that took
 * longer than this would have its lock stolen out from under it.
 */
const STALE_MS = 30_000;
const BEAT_MS = 5_000;
const RETRY_MS = 40;

/**
 * Must stay comfortably ABOVE `STALE_MS`: a waiter that gives up first can
 * never reach the takeover it is waiting for, so a dead holder would turn
 * every concurrent write into an error for the remainder of the stale window.
 */
const MAX_WAIT_MS = 90_000;

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
        // It vanished between the mkdir and the stat: fall through to the
        // wait below rather than spinning, which retried with no delay and
        // no timeout check.
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
  /**
   * Keep the mtime moving while we hold it. Without this the staleness check
   * measures how long ago the lock was *taken*, so a write that legitimately
   * outlives `STALE_MS` — a big `git add -A` on a slow disk — gets its lock
   * stolen and two writers rewrite the same file at once.
   */
  const beat = setInterval(() => {
    const now = new Date();
    void fs.utimes(dir, now, now).catch(() => {});
  }, BEAT_MS);
  beat.unref?.();
  try {
    return await run();
  } finally {
    clearInterval(beat);
    await release(dir);
  }
}
