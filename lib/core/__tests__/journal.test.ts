import { describe, expect, it, afterEach, beforeEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

beforeEach(() => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-data-"));
  process.env.PLANNER_DATA_DIR = tmp;
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

function localDate(): string {
  const now = new Date();
  return now.toLocaleDateString("sv").slice(0, 10);
}

describe("appendJournal", () => {
  it("appends a scoped entry to today's journal file", async () => {
    const { appendJournal } = await import("../journal");
    await appendJournal("demo", "did a thing");
    const date = localDate();
    const content = await fs.readFile(path.join(tmp, "journal", `${date}.md`), "utf8");
    expect(content).toMatch(/^- \d{2}:\d{2} \[demo\] did a thing$/m);
  });

  it("appends multiple entries without duplicating the header", async () => {
    const { appendJournal } = await import("../journal");
    await appendJournal("demo", "first");
    await appendJournal("demo", "second");
    const date = localDate();
    const content = await fs.readFile(path.join(tmp, "journal", `${date}.md`), "utf8");
    const lines = content.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(2);
    expect(content).toMatch(/^- \d{2}:\d{2} \[demo\] first$/m);
    expect(content).toMatch(/^- \d{2}:\d{2} \[demo\] second$/m);
  });
});

describe("commitData", () => {
  it("commits appended journal changes in a temp git repo", async () => {
    const git = simpleGit(tmp);
    await git.init();
    await git.addConfig("user.name", "test");
    await git.addConfig("user.email", "test@example.com");

    const { appendJournal } = await import("../journal");
    const { commitData } = await import("../git");
    await appendJournal("demo", "committed thing");
    await commitData("test: journal commit");

    const log = await git.log();
    expect(log.total).toBeGreaterThanOrEqual(1);
    expect(log.latest?.message).toBe("test: journal commit");
  });

  it("throws when data root is not a git repo", async () => {
    const { commitData } = await import("../git");
    await expect(commitData("nope")).rejects.toThrow(/not a git repo/);
  });
});
