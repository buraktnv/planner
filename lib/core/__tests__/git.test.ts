import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { commitData } from "../git";

let tmp: string;
const prev = process.env.PLANNER_DATA_DIR;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "planner-git-"));
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
});

afterEach(async () => {
  if (prev === undefined) delete process.env.PLANNER_DATA_DIR;
  else process.env.PLANNER_DATA_DIR = prev;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

describe("commitData", () => {
  it("commits when the data root is the top level of its own repo", async () => {
    process.env.PLANNER_DATA_DIR = tmp;
    await fs.writeFile(path.join(tmp, "about.md"), "hello\n");
    await commitData("first");
    const log = await simpleGit(tmp).log();
    expect(log.latest?.message).toBe("first");
  });

  it("refuses to commit when the data root is a plain folder inside another repo", async () => {
    const nested = path.join(tmp, "not-a-repo");
    await fs.mkdir(nested);
    await fs.writeFile(path.join(nested, "about.md"), "hello\n");
    process.env.PLANNER_DATA_DIR = nested;
    await expect(commitData("oops")).rejects.toThrow(/not a git repo of its own/);
    const status = await simpleGit(tmp).status();
    expect(status.staged).toEqual([]);
  });

  it("refuses to commit when the data root is not in any repo", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "planner-nogit-"));
    try {
      process.env.PLANNER_DATA_DIR = outside;
      await expect(commitData("oops")).rejects.toThrow(/not a git repo/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
    }
  });
});
