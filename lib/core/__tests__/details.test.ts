import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

function localDate(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-details-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

describe("task details", () => {
  it("round-trips a body and lands under details/", async () => {
    const { writeDetail, readDetail } = await import("../details");
    const body = "## Plan\n\nCheck the backoff, then confirm it retries 3x.";
    await writeDetail("project", "acme-app", "T-001", body);

    const onDisk = await fs.readFile(
      path.join(tmp, "projects", "acme-app", "details", "T-001.md"),
      "utf8",
    );
    expect(onDisk).toBe(`${body}\n`);
    expect(await readDetail("project", "acme-app", "T-001")).toBe(`${body}\n`);
  });

  it("returns null when there is no detail", async () => {
    const { readDetail } = await import("../details");
    expect(await readDetail("project", "acme-app", "T-404")).toBeNull();
  });

  it("stores detail for a dotted subtask id", async () => {
    const { writeDetail, readDetail, listDetailIds } = await import("../details");
    await writeDetail("area", "health", "T-003.2.1", "sub plan");
    expect(await readDetail("area", "health", "T-003.2.1")).toBe("sub plan\n");
    expect(await listDetailIds("area", "health")).toEqual(["T-003.2.1"]);
  });

  it("removes the file when the body is empty", async () => {
    const { writeDetail, readDetail, listDetailIds } = await import("../details");
    await writeDetail("project", "acme-app", "T-001", "something");
    await writeDetail("project", "acme-app", "T-001", "   ");
    expect(await readDetail("project", "acme-app", "T-001")).toBeNull();
    expect(await listDetailIds("project", "acme-app")).toEqual([]);
  });

  it("journals and commits on write", async () => {
    const { writeDetail } = await import("../details");
    const git = simpleGit(tmp);
    const before = (await git.log().catch(() => ({ all: [] }))).all.length;

    await writeDetail("project", "acme-app", "T-007", "plan body");

    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toContain("[acme-app] T-007 detail updated");
    expect((await git.log()).all.length).toBe(before + 1);
  });

  it("rejects task ids that could escape the details directory", async () => {
    const { writeDetail, readDetail } = await import("../details");
    const bad = ["../../evil", "T-1/../../evil", "/etc/passwd", "C:\\windows\\x", "T-1;rm -rf", ""];
    for (const id of bad) {
      await expect(writeDetail("project", "acme-app", id, "x")).rejects.toThrow(/Invalid task id/);
      await expect(readDetail("project", "acme-app", id)).rejects.toThrow(/Invalid task id/);
    }
    expect(fsSync.existsSync(path.join(tmp, "projects", "acme-app", "details"))).toBe(false);
  });

  it("ignores stray files in the details directory", async () => {
    const { listDetailIds } = await import("../details");
    const dir = path.join(tmp, "projects", "acme-app", "details");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "T-001.md"), "ok", "utf8");
    await fs.writeFile(path.join(dir, "notes.txt"), "x", "utf8");
    await fs.writeFile(path.join(dir, "README.md"), "x", "utf8");
    expect(await listDetailIds("project", "acme-app")).toEqual(["T-001"]);
  });

  it("returns an empty list when the charter has no details dir", async () => {
    const { listDetailIds } = await import("../details");
    expect(await listDetailIds("project", "nothing-here")).toEqual([]);
  });
});
