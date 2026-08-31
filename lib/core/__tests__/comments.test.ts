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
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-comments-"));
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

const logFile = (slug: string, id: string) =>
  path.join(tmp, "projects", slug, "comments", `${id}.md`);

describe("task comments", () => {
  it("appends an entry and lands under comments/", async () => {
    const { appendComment, readComments } = await import("../comments");
    const entry = await appendComment("project", "acme-app", "T-001", "Backoff is in.");

    expect(entry.body).toBe("Backoff is in.");
    expect(entry.date).toBe(localDate());
    expect(entry.marker).toBeNull();

    const onDisk = await fs.readFile(logFile("acme-app", "T-001"), "utf8");
    expect(onDisk).toMatch(/^# T-001 — log\n/);
    expect(onDisk).toMatch(/\n## \d{4}-\d{2}-\d{2} \d{2}:\d{2}\nBackoff is in\.\n$/);

    const entries = await readComments("project", "acme-app", "T-001");
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toBe("Backoff is in.");
  });

  it("appends without disturbing a single byte of what is already there", async () => {
    // This is the append-only property, and bytes are the only honest test of it.
    const { appendComment, readComments } = await import("../comments");
    await appendComment("project", "acme-app", "T-001", "first");
    const after1 = await fs.readFile(logFile("acme-app", "T-001"), "utf8");

    await appendComment("project", "acme-app", "T-001", "second");
    const after2 = await fs.readFile(logFile("acme-app", "T-001"), "utf8");

    expect(after2.startsWith(after1)).toBe(true);

    const entries = await readComments("project", "acme-app", "T-001");
    expect(entries.map((e) => e.body)).toEqual(["first", "second"]);
  });

  it("round-trips a multi-line body with blank lines and a fenced block", async () => {
    const { appendComment, readComments } = await import("../comments");
    const body = [
      "Tried the index approach; it double-counts.",
      "",
      "```",
      "Error: ECONNRESET",
      "    at TLSWrap.onStreamRead",
      "```",
      "",
      "Backing it out.",
    ].join("\n");
    await appendComment("project", "acme-app", "T-002", body);

    const entries = await readComments("project", "acme-app", "T-002");
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toBe(body);
  });

  it("keeps a pasted markdown heading inside the entry that owns it", async () => {
    const { appendComment, readComments } = await import("../comments");
    await appendComment("project", "acme-app", "T-003", "notes\n\n## Results\n\nall green");

    const entries = await readComments("project", "acme-app", "T-003");
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toContain("## Results");
  });

  it("stops a body from forging an entry boundary", async () => {
    // A body line shaped exactly like a stamp is indented by the writer, so a
    // comment can never split itself into two dated entries.
    const { appendComment, readComments } = await import("../comments");
    await appendComment("project", "acme-app", "T-004", "real\n## 2020-01-01 09:00\nforged");

    const entries = await readComments("project", "acme-app", "T-004");
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe(localDate());
    expect(entries[0].body).toContain("2020-01-01 09:00");
  });

  it("logs against a dotted subtask id in an area", async () => {
    const { appendComment, readComments, listCommentedIds } = await import("../comments");
    await appendComment("area", "health", "T-003.2.1", "rescheduled");

    expect(
      fsSync.existsSync(path.join(tmp, "areas", "health", "comments", "T-003.2.1.md")),
    ).toBe(true);
    const entries = await readComments("area", "health", "T-003.2.1");
    expect(entries[0].body).toBe("rescheduled");
    expect(await listCommentedIds("area", "health")).toEqual(["T-003.2.1"]);
  });

  it("journals the entry and makes exactly one commit", async () => {
    const { appendComment } = await import("../comments");
    const git = simpleGit(tmp);
    const before = (await git.log().catch(() => ({ all: [] }))).all.length;

    await appendComment("project", "acme-app", "T-007", "went sideways");

    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toContain("[acme-app] T-007 comment added");
    expect((await git.log()).all.length).toBe(before + 1);
  });

  it("refuses an empty body and writes nothing", async () => {
    const { appendComment, listCommentedIds } = await import("../comments");
    await expect(appendComment("project", "acme-app", "T-001", "   ")).rejects.toThrow(
      /needs a body/,
    );
    expect(await listCommentedIds("project", "acme-app")).toEqual([]);
  });

  it("refuses a body over the size cap", async () => {
    const { appendComment, MAX_COMMENT_LENGTH } = await import("../comments");
    await expect(
      appendComment("project", "acme-app", "T-001", "x".repeat(MAX_COMMENT_LENGTH + 1)),
    ).rejects.toThrow(/at most/);
  });

  it("rejects any id that is not a task id, and creates no directory", async () => {
    const { appendComment, readComments } = await import("../comments");
    const bad = ["../../evil", "T-1/../../evil", "/etc/passwd", "C:\\windows\\x", "T-1;rm -rf", ""];
    for (const id of bad) {
      await expect(appendComment("project", "acme-app", id, "x")).rejects.toThrow(
        /Invalid task id/,
      );
      await expect(readComments("project", "acme-app", id)).rejects.toThrow(/Invalid task id/);
    }
    expect(fsSync.existsSync(path.join(tmp, "projects", "acme-app", "comments"))).toBe(false);
  });

  it("returns an empty list when nothing has been logged", async () => {
    const { readComments, listCommentedIds } = await import("../comments");
    expect(await readComments("project", "acme-app", "T-404")).toEqual([]);
    expect(await listCommentedIds("project", "acme-app")).toEqual([]);
  });

  it("ignores files that are not a task log", async () => {
    const { appendComment, listCommentedIds } = await import("../comments");
    await appendComment("project", "acme-app", "T-001", "x");
    const dir = path.join(tmp, "projects", "acme-app", "comments");
    await fs.writeFile(path.join(dir, "notes.txt"), "junk");
    await fs.writeFile(path.join(dir, "README.md"), "junk");
    expect(await listCommentedIds("project", "acme-app")).toEqual(["T-001"]);
  });
});

describe("parseComments is total", () => {
  it("never throws, whatever the file holds", async () => {
    const { parseComments } = await import("../comments");
    const nasty = [
      "",
      "   ",
      "no headings at all",
      "### 2026-01-01 10:00\nwrong depth",
      "## not-a-date 10:00\nbody",
      "## 2026-13-99 99:99\nout of range but well shaped",
      "\r\n## 2026-09-01 14:02\r\nwindows line endings\r\n",
      "## 2026-09-01 14:02",
    ];
    for (const raw of nasty) {
      expect(() => parseComments(raw)).not.toThrow();
    }
  });

  it("keeps text that sits before the first entry", async () => {
    const { parseComments } = await import("../comments");
    const log = parseComments("# T-001 — log\nstray note\n\n## 2026-09-01 14:02\nreal entry");
    expect(log.preamble).toContain("stray note");
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].body).toBe("real entry");
  });

  it("preserves a marker it does not recognise, rather than eating it", async () => {
    const { parseComments } = await import("../comments");
    const log = parseComments("## 2026-09-01 14:02 · decision\nwent with the set");
    expect(log.entries[0].marker).toBe("decision");
    expect(log.entries[0].body).toBe("went with the set");
  });

  it("reads an entry with an empty body as an entry, not a dropped one", async () => {
    const { parseComments } = await import("../comments");
    const log = parseComments("## 2026-09-01 14:02\n\n## 2026-09-01 15:00\nsecond");
    expect(log.entries).toHaveLength(2);
    expect(log.entries[0].body).toBe("");
  });
});
