import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DistillError,
  candidateToAction,
  dedupeCandidates,
  deriveTitle,
  distillPrompt,
  isStructuredProfile,
  pickDistillProfile,
  type Candidate,
} from "../distill";
import { buildProposal } from "../tools";
import type { KnowledgeNote, ProviderProfile, ProvidersFile } from "@/lib/core/types";

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    title: "Grid dies in trends",
    summary: "Fixed spacing cannot survive a breakout.",
    body: "Ran it three weeks.",
    scope: ["ftbot"],
    tags: ["strategy"],
    source: "journal 2026-08-21",
    ...over,
  };
}

function note(title: string, id = "K-001"): KnowledgeNote {
  return {
    id,
    title,
    summary: "S",
    scope: [],
    tags: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "",
  };
}

const claudeSub: ProviderProfile = {
  id: "claude-sub",
  type: "claude-subscription",
  model: "opus",
  label: "Claude (my subscription)",
};
const deepseek: ProviderProfile = {
  id: "ds-pro",
  type: "deepseek",
  model: "deepseek-v4-pro",
  label: "DeepSeek V4 Pro",
};

function providers(profiles: ProviderProfile[], def: string): ProvidersFile {
  return { profiles, default: def };
}

describe("isStructuredProfile", () => {
  it("excludes only the claude subscription path", () => {
    expect(isStructuredProfile(claudeSub)).toBe(false);
    expect(isStructuredProfile(deepseek)).toBe(true);
  });
});

describe("pickDistillProfile", () => {
  it("throws with no profiles", () => {
    expect(() => pickDistillProfile(providers([], ""))).toThrow(DistillError);
  });

  it("uses the default when it can do structured output", () => {
    expect(pickDistillProfile(providers([deepseek, claudeSub], "ds-pro")).id).toBe("ds-pro");
  });

  it("falls back past a claude-subscription default", () => {
    expect(pickDistillProfile(providers([claudeSub, deepseek], "claude-sub")).id).toBe("ds-pro");
  });

  it("explains itself when only the subscription path exists", () => {
    expect(() => pickDistillProfile(providers([claudeSub], "claude-sub"))).toThrow(
      /needs an API provider profile/,
    );
  });

  it("honours an explicit profile id", () => {
    expect(pickDistillProfile(providers([claudeSub, deepseek], "claude-sub"), "ds-pro").id).toBe(
      "ds-pro",
    );
  });

  it("rejects an unknown explicit id", () => {
    expect(() => pickDistillProfile(providers([deepseek], "ds-pro"), "nope")).toThrow(
      /Unknown provider profile/,
    );
  });

  it("rejects an explicit subscription profile", () => {
    expect(() => pickDistillProfile(providers([claudeSub, deepseek], "ds-pro"), "claude-sub")).toThrow(
      /chat-only/,
    );
  });
});

describe("dedupeCandidates", () => {
  it("drops candidates matching an existing title, ignoring case and punctuation", () => {
    const kept = dedupeCandidates(
      [candidate({ title: "Grid Dies, In Trends!" })],
      [note("grid dies in trends")],
    );
    expect(kept).toEqual([]);
  });

  it("drops duplicates within one batch", () => {
    const kept = dedupeCandidates([candidate(), candidate({ body: "different" })], []);
    expect(kept).toHaveLength(1);
  });

  it("drops candidates with no summary", () => {
    expect(dedupeCandidates([candidate({ summary: "  " })], [])).toEqual([]);
  });

  it("derives a title from the summary when the model omits one", () => {
    const kept = dedupeCandidates([candidate({ title: "" })], []);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("Fixed spacing cannot survive a breakout");
  });

  it("dedupes a derived title against an existing note", () => {
    expect(
      dedupeCandidates(
        [candidate({ title: "" })],
        [note("Fixed spacing cannot survive a breakout")],
      ),
    ).toEqual([]);
  });

  it("keeps genuinely new candidates in order", () => {
    const kept = dedupeCandidates(
      [candidate({ title: "One" }), candidate({ title: "Two" })],
      [note("Three")],
    );
    expect(kept.map((c) => c.title)).toEqual(["One", "Two"]);
  });
});

describe("deriveTitle", () => {
  it("takes the first sentence without its punctuation", () => {
    expect(deriveTitle("One instance per account. The limit is per account.")).toBe(
      "One instance per account",
    );
  });

  it("trims a long summary on a word boundary", () => {
    const title = deriveTitle(
      "Every single recovery path in the whole system must re-read its state before acting on anything",
    );
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).not.toMatch(/\s$/);
    expect(title.endsWith("re-")).toBe(false);
  });

  it("handles a summary with no sentence break", () => {
    expect(deriveTitle("short one")).toBe("short one");
  });
});

describe("candidateToAction", () => {
  it("maps a full candidate", () => {
    expect(candidateToAction(candidate())).toEqual({
      kind: "add_note",
      title: "Grid dies in trends",
      summary: "Fixed spacing cannot survive a breakout.",
      body: "Ran it three weeks.",
      scope: ["ftbot"],
      tags: ["strategy"],
      source: "journal 2026-08-21",
    });
  });

  it("omits empty optional fields rather than sending blanks", () => {
    const action = candidateToAction(
      candidate({ body: "  ", scope: [], tags: ["  "], source: "" }),
    );
    expect(action).toEqual({
      kind: "add_note",
      title: "Grid dies in trends",
      summary: "Fixed spacing cannot survive a breakout.",
    });
  });

  it("lowercases tags", () => {
    const action = candidateToAction(candidate({ tags: ["Strategy", "POSTMORTEM"] }));
    expect(action).toMatchObject({ tags: ["strategy", "postmortem"] });
  });
});

describe("distillPrompt", () => {
  it("includes the digest, the known index and the valid scopes", () => {
    const prompt = distillPrompt({
      journalDigest: "## 2026-08-27\n- 09:00 [ftbot] shipped",
      indexLines: ["- K-001 | ftbot | - | Title | Summary."],
      scopeKeys: ["ftbot", "area:daily"],
      days: 7,
    });
    expect(prompt).toContain("last 7 days");
    expect(prompt).toContain("shipped");
    expect(prompt).toContain("K-001");
    expect(prompt).toContain("ftbot, area:daily");
    expect(prompt).toContain("Propose at most 5");
  });

  it("says so when nothing is filed and no scopes exist", () => {
    const prompt = distillPrompt({ journalDigest: "", indexLines: [], scopeKeys: [], days: 3 });
    expect(prompt).toContain("(nothing filed yet)");
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("(no entries)");
  });
});

describe("proposal preview for note actions", () => {
  let tmp: string;
  const prev = process.env.PLANNER_DATA_DIR;

  beforeEach(() => {
    tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-distill-"));
    process.env.PLANNER_DATA_DIR = tmp;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.PLANNER_DATA_DIR;
    else process.env.PLANNER_DATA_DIR = prev;
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
  });

  it("previews add_note with the summary as the note line", async () => {
    const proposal = await buildProposal({
      title: "Distilled 1 note",
      actions: [candidateToAction(candidate())],
    });
    expect(proposal.preview).toHaveLength(1);
    const row = proposal.preview[0];
    expect(row.kind).toBe("add_note");
    expect(row.id).toBe("NOTE");
    expect(row.title).toBe("Grid dies in trends");
    expect(row.note).toBe("note");
    expect(row.detail).toBe("Fixed spacing cannot survive a breakout.");
    expect(row.charterName).toBe("ftbot");
    expect(row.lane).toBeNull();
  });

  it("labels a scopeless note as knowledge", async () => {
    const proposal = await buildProposal({
      title: "Distilled",
      actions: [candidateToAction(candidate({ scope: [] }))],
    });
    expect(proposal.preview[0].charterName).toBe("knowledge");
  });

  it("previews update_note", async () => {
    const proposal = await buildProposal({
      title: "Amend",
      actions: [{ kind: "update_note", id: "K-014", summary: "Sharper conclusion." }],
    });
    const row = proposal.preview[0];
    expect(row.kind).toBe("update_note");
    expect(row.id).toBe("K-014");
    expect(row.note).toBe("note");
    expect(row.detail).toBe("Sharper conclusion.");
    expect(row.charterName).toBe("knowledge");
  });
});
