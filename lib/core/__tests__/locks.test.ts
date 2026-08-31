import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lockPathFor, withDataLock } from "../locks";

let dir: string;
let prev: string | undefined;

beforeEach(async () => {
  prev = process.env.PLANNER_DATA_DIR;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-lock-test-"));
  process.env.PLANNER_DATA_DIR = dir;
  await fs.rm(lockPathFor(dir), { recursive: true, force: true });
});

afterEach(async () => {
  await fs.rm(lockPathFor(dir), { recursive: true, force: true });
  if (prev === undefined) delete process.env.PLANNER_DATA_DIR;
  else process.env.PLANNER_DATA_DIR = prev;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("withDataLock", () => {
  it("runs one holder at a time", async () => {
    let live = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withDataLock(async () => {
          live += 1;
          peak = Math.max(peak, live);
          await new Promise((r) => setTimeout(r, 5));
          live -= 1;
        }),
      ),
    );

    expect(peak).toBe(1);
  });

  it("releases the lock when the body throws", async () => {
    await expect(
      withDataLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // The next caller must not hang or find a leftover directory.
    await expect(withDataLock(async () => "after")).resolves.toBe("after");
    await expect(fs.stat(lockPathFor(dir))).rejects.toThrow();
  });

  it("hands the value back from the body", async () => {
    await expect(withDataLock(async () => 42)).resolves.toBe(42);
  });

  /**
   * The holder heartbeats the lock's mtime. Without it, staleness measured how
   * long ago the lock was TAKEN, so a slow-but-alive write would have its lock
   * stolen and two writers would rewrite the same file at once.
   */
  it("keeps the lock fresh while a slow write is still running", async () => {
    const lock = lockPathFor(dir);

    await withDataLock(async () => {
      const first = (await fs.stat(lock)).mtimeMs;
      await new Promise((r) => setTimeout(r, 5_200));
      const later = (await fs.stat(lock)).mtimeMs;
      expect(later).toBeGreaterThan(first);
    });
  }, 20_000);

  it("takes over a lock whose holder died", async () => {
    const lock = lockPathFor(dir);
    await fs.mkdir(lock, { recursive: true });
    // A dead holder leaves the directory behind with an mtime that stops moving.
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(lock, old, old);

    await expect(withDataLock(async () => "recovered")).resolves.toBe("recovered");
  }, 20_000);
});
