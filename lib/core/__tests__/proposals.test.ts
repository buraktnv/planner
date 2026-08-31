import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import simpleGit from "simple-git";
import {
  assertProposalId,
  claimProposal,
  fileProposal,
  getProposal,
  listProposals,
  parseProposalFile,
  proposalIdOk,
  recordOutcome,
  releaseProposal,
  serializeProposal,
  type StoredProposal,
} from "../proposals";
import { proposalsDir } from "../paths";

let dir: string;
let prev: string | undefined;

beforeEach(async () => {
  prev = process.env.PLANNER_DATA_DIR;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-proposals-"));
  process.env.PLANNER_DATA_DIR = dir;
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await fs.writeFile(path.join(dir, "README.md"), "seed\n", "utf8");
  await git.add("-A");
  await git.commit("seed");
});

afterEach(async () => {
  if (prev === undefined) delete process.env.PLANNER_DATA_DIR;
  else process.env.PLANNER_DATA_DIR = prev;
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

const ACTIONS = [
  { kind: "create_task", project: "acme-bot", title: "One", size: "S" },
  { kind: "add_note", title: "How it works", summary: "A claim", body: "Body" },
];

function stored(over: Partial<StoredProposal> = {}): StoredProposal {
  return {
    id: "p-abc123-def45",
    status: "pending",
    title: "A batch",
    agent: "claude-code",
    created: "2026-08-31 10:00:00",
    actions: ACTIONS,
    dropped: 0,
    unknown: [],
    ...over,
  };
}

describe("proposal ids", () => {
  it("accepts the shape buildProposal mints", () => {
    expect(proposalIdOk("p-mthg68wd-f6fi2")).toBe(true);
  });

  /** The id is interpolated into a path, and it comes from an agent process. */
  it("refuses anything that could escape the directory", () => {
    for (const bad of [
      "../../etc/passwd",
      "p-../-x",
      "p-a/b-c",
      "p-a\\b-c",
      "P-ABC-DEF",
      "",
      "p-abc",
      "proposal",
    ]) {
      expect(proposalIdOk(bad)).toBe(false);
    }
    expect(() => assertProposalId("../x")).toThrow(/Invalid proposal id/);
  });
});

describe("parseProposalFile is total", () => {
  it("round-trips what it wrote", () => {
    const p = stored({ summary: "Two things", outcome: "all good" });
    const back = parseProposalFile(serializeProposal(p), p.id);
    expect(back.id).toBe(p.id);
    expect(back.title).toBe(p.title);
    expect(back.summary).toBe(p.summary);
    expect(back.agent).toBe(p.agent);
    expect(back.status).toBe("pending");
    expect(back.actions).toEqual(ACTIONS);
    expect(back.dropped).toBe(0);
  });

  it("keeps a title containing quotes and colons", () => {
    const p = stored({ title: 'Fix: the "hard" one | really' });
    expect(parseProposalFile(serializeProposal(p), p.id).title).toBe(p.title);
  });

  it("reads nothing as an empty pending proposal rather than throwing", () => {
    for (const raw of ["", "   ", "\n\n"]) {
      const p = parseProposalFile(raw, "p-aaa-bbb");
      expect(p.status).toBe("pending");
      expect(p.actions).toEqual([]);
    }
  });

  it("survives junk instead of taking down the page that lists it", () => {
    for (const raw of ["not a proposal", "---\n", "---\nid\n---\n", "```jsonl\n"]) {
      expect(() => parseProposalFile(raw, "p-aaa-bbb")).not.toThrow();
    }
  });

  /**
   * The reason actions are one-per-line: a torn write costs the line it cut,
   * not every action in the batch.
   */
  it("keeps the intact actions when one line is torn", () => {
    const raw = [
      "---",
      "id: p-abc123-def45",
      "status: pending",
      'title: "A batch"',
      "---",
      "",
      "```jsonl",
      JSON.stringify(ACTIONS[0]),
      '{"kind":"add_note","title":"cut off',
      JSON.stringify(ACTIONS[1]),
      "```",
    ].join("\n");
    const p = parseProposalFile(raw, "p-abc123-def45");
    expect(p.actions).toEqual(ACTIONS);
    expect(p.dropped).toBe(1);
  });

  it("falls back to pending for a status it does not know", () => {
    const p = stored();
    const raw = serializeProposal(p).replace("status: pending", "status: half-eaten");
    expect(parseProposalFile(raw, p.id).status).toBe("pending");
  });

  it("ignores an unknown frontmatter key rather than refusing the file", () => {
    const p = stored();
    const raw = serializeProposal(p).replace("status: pending", "status: pending\nflavour: grape");
    expect(parseProposalFile(raw, p.id).actions).toEqual(ACTIONS);
  });

  it("keeps body content it does not understand, so a rewrite cannot lose it", () => {
    const p = stored();
    const raw = `${serializeProposal(p)}\nA human note about this batch.\n`;
    const back = parseProposalFile(raw, p.id);
    expect(back.unknown.join("\n")).toContain("A human note");
    expect(parseProposalFile(serializeProposal(back), p.id).unknown.join("\n")).toContain(
      "A human note",
    );
  });

  it("ignores an id in the file that could escape a path", () => {
    const raw = serializeProposal(stored()).replace("id: p-abc123-def45", "id: ../../escape");
    expect(parseProposalFile(raw, "p-safe1-safe2").id).toBe("p-safe1-safe2");
  });
});

describe("the store", () => {
  it("files a proposal and reads it back", async () => {
    const filed = await fileProposal(
      { proposalId: "p-abc123-def45", title: "A batch", actions: ACTIONS },
      "claude-code",
    );
    expect(filed.status).toBe("pending");

    const back = await getProposal("p-abc123-def45");
    expect(back?.actions).toEqual(ACTIONS);
    expect(back?.agent).toBe("claude-code");
  });

  it("lists only what was asked for", async () => {
    await fileProposal({ proposalId: "p-aaa1-bbb1", title: "One", actions: ACTIONS }, "a");
    await fileProposal({ proposalId: "p-aaa2-bbb2", title: "Two", actions: ACTIONS }, "b");
    await recordOutcome("p-aaa2-bbb2", "applied");

    expect((await listProposals()).length).toBe(2);
    expect((await listProposals("pending")).map((p) => p.id)).toEqual(["p-aaa1-bbb1"]);
    expect((await listProposals("applied")).map((p) => p.id)).toEqual(["p-aaa2-bbb2"]);
  });

  it("returns nothing for a missing or malformed id", async () => {
    expect(await getProposal("p-nope1-nope2")).toBeNull();
    expect(await getProposal("../../escape")).toBeNull();
  });

  it("ignores a file whose name is not a proposal id", async () => {
    await fs.mkdir(proposalsDir(), { recursive: true });
    await fs.writeFile(path.join(proposalsDir(), "notes.md"), "hello", "utf8");
    expect(await listProposals()).toEqual([]);
  });

  it("keeps an applied proposal rather than deleting it", async () => {
    await fileProposal({ proposalId: "p-abc123-def45", title: "A batch", actions: ACTIONS }, "a");
    await recordOutcome("p-abc123-def45", "applied", "2 of 2 applied");

    const back = await getProposal("p-abc123-def45");
    expect(back?.status).toBe("applied");
    expect(back?.outcome).toBe("2 of 2 applied");
    expect(back?.applied).toBeTruthy();
    expect(back?.actions).toEqual(ACTIONS);
  });
});

describe("claiming, which is what stops a double apply", () => {
  beforeEach(async () => {
    await fileProposal({ proposalId: "p-abc123-def45", title: "A batch", actions: ACTIONS }, "a");
  });

  it("lets exactly one of two concurrent claims win", async () => {
    const [one, two] = await Promise.all([
      claimProposal("p-abc123-def45"),
      claimProposal("p-abc123-def45"),
    ]);
    expect([one.ok, two.ok].filter(Boolean)).toHaveLength(1);
    const loser = one.ok ? two : one;
    expect(loser.ok).toBe(false);
    if (!loser.ok) expect(loser.reason).toMatch(/already applying/);
  });

  it("refuses to claim something already applied", async () => {
    await recordOutcome("p-abc123-def45", "applied");
    const claim = await claimProposal("p-abc123-def45");
    expect(claim.ok).toBe(false);
  });

  it("refuses a proposal that does not exist", async () => {
    const claim = await claimProposal("p-zzz1-zzz2");
    expect(claim.ok).toBe(false);
    if (!claim.ok) expect(claim.reason).toMatch(/not found/);
  });

  it("can be released so a failed attempt is offered again", async () => {
    expect((await claimProposal("p-abc123-def45")).ok).toBe(true);
    await releaseProposal("p-abc123-def45");
    expect((await getProposal("p-abc123-def45"))?.status).toBe("pending");
    expect((await claimProposal("p-abc123-def45")).ok).toBe(true);
  });
});

describe("concurrency", () => {
  /** Two agents filing at once must not clobber each other's file. */
  it("keeps both proposals when two are filed together", async () => {
    await Promise.all([
      fileProposal({ proposalId: "p-aaa1-bbb1", title: "One", actions: ACTIONS }, "a"),
      fileProposal({ proposalId: "p-aaa2-bbb2", title: "Two", actions: ACTIONS }, "b"),
    ]);
    expect((await listProposals()).map((p) => p.id).sort()).toEqual(["p-aaa1-bbb1", "p-aaa2-bbb2"]);
  });

  it("does not let concurrent commits fail each other", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        fileProposal({ proposalId: `p-bur${i}-st${i}`, title: `B${i}`, actions: ACTIONS }, "a"),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  /**
   * The lock is not re-entrant, so this sequence is exactly what would hang if
   * any of these three wrapped another locked call.
   */
  it("files, claims and records without deadlocking", async () => {
    await fileProposal({ proposalId: "p-abc123-def45", title: "A batch", actions: ACTIONS }, "a");
    expect((await claimProposal("p-abc123-def45")).ok).toBe(true);
    await recordOutcome("p-abc123-def45", "partial", "1 of 2 applied");
    expect((await getProposal("p-abc123-def45"))?.status).toBe("partial");
  }, 15_000);
});
