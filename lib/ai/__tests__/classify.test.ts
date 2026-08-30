import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import {
  NEVER_MINT,
  autoAreasCreatedRecently,
  buildCandidates,
  classifyPrompt,
  createAreaGuarded,
  literalScopeHit,
  nearestExistingSlug,
  normaliseScope,
  noteText,
  scopeKeyOf,
  type ScopeCandidate,
} from "../classify";
import { createCharter, listCharters } from "@/lib/core/store";
import type { Charter } from "@/lib/core/types";

function charter(over: Partial<Charter> = {}): Charter {
  return {
    id: "health",
    name: "Health",
    type: "area",
    status: "active",
    priority: 1,
    created: "2026-08-01",
    updated: "2026-08-01",
    why: "Sustain energy and focus. Protect sleep, movement and diet.",
    mvpScope: [],
    parkingLot: [],
    ...over,
  };
}

const CANDIDATES: ScopeCandidate[] = [
  { key: "area:health", name: "Health", type: "area", slug: "health" },
  { key: "area:finance", name: "Finance", type: "area", slug: "finance" },
  { key: "acme-bot", name: "Acme Bot", type: "project", slug: "acme-bot" },
];

describe("scopeKeyOf", () => {
  it("prefixes areas and leaves projects bare", () => {
    expect(scopeKeyOf({ type: "area", id: "health" })).toBe("area:health");
    expect(scopeKeyOf({ type: "project", id: "acme-bot" })).toBe("acme-bot");
  });
});

describe("buildCandidates", () => {
  it("keeps active and paused charters and drops the rest", () => {
    const keys = buildCandidates([
      charter({ id: "health", name: "Health" }),
      charter({ id: "old", name: "Old", status: "done" }),
      charter({ id: "paused", name: "Paused", status: "paused" }),
      charter({ id: "gone", name: "Gone", status: "abandoned" }),
    ]).map((c) => c.key);
    expect(keys).toEqual(["area:health", "area:paused"]);
  });
});

describe("literalScopeHit", () => {
  it("matches a project slug named outright", () => {
    expect(literalScopeHit("The acme-bot retry loop is flaky", CANDIDATES)).toBe(
      "acme-bot",
    );
  });

  it("matches the slug written with spaces", () => {
    expect(literalScopeHit("acme bot keeps dropping its session", CANDIDATES)).toBe(
      "acme-bot",
    );
  });

  it("matches an area by name, case-insensitively", () => {
    expect(literalScopeHit("Some notes about my FINANCE plans", CANDIDATES)).toBe("area:finance");
  });

  it("abstains when two scopes are named", () => {
    expect(literalScopeHit("Balancing health against finance", CANDIDATES)).toBeNull();
  });

  it("abstains when nothing is named", () => {
    expect(literalScopeHit("My cholesterol came back high", CANDIDATES)).toBeNull();
  });

  it("does not match a word that merely contains a slug", () => {
    expect(literalScopeHit("healthcare policy is confusing", CANDIDATES)).toBeNull();
  });
});

describe("normaliseScope", () => {
  it("accepts an exact key", () => {
    expect(normaliseScope("area:health", CANDIDATES)).toBe("area:health");
  });

  it("repairs a bare slug, a name, and stray casing", () => {
    expect(normaliseScope("health", CANDIDATES)).toBe("area:health");
    expect(normaliseScope("Health", CANDIDATES)).toBe("area:health");
    expect(normaliseScope("  Acme Bot ", CANDIDATES)).toBe("acme-bot");
  });

  it("repairs a doubled prefix", () => {
    expect(normaliseScope("area:area:health", CANDIDATES)).toBe("area:health");
  });

  it("rejects an invented scope rather than passing it to the writer", () => {
    expect(normaliseScope("area:cholesterol", CANDIDATES)).toBeNull();
    expect(normaliseScope("health_markers", CANDIDATES)).toBeNull();
    expect(normaliseScope("", CANDIDATES)).toBeNull();
  });
});

describe("nearestExistingSlug", () => {
  it("catches an exact match and a containment", () => {
    expect(nearestExistingSlug("health", ["health", "finance"])).toBe("health");
    expect(nearestExistingSlug("health-markers", ["health"])).toBe("health");
    expect(nearestExistingSlug("bloodwork", ["health"])).toBeNull();
  });
});

describe("noteText and classifyPrompt", () => {
  it("joins the parts it has", () => {
    expect(noteText({ summary: "S", body: "B" })).toBe("S B");
    expect(noteText({ title: "T", summary: "S" })).toBe("T S");
  });

  it("lists every candidate and forbids inventing keys", () => {
    const prompt = classifyPrompt("cholesterol came back high", CANDIDATES);
    expect(prompt).toContain("area:health — Health");
    expect(prompt).toContain("acme-bot — Acme Bot");
    expect(prompt).toContain("Never invent a scope key");
    expect(prompt).toContain("cholesterol came back high");
  });

  it("says so when nothing exists yet", () => {
    expect(classifyPrompt("anything", [])).toContain("(no scopes exist yet)");
  });
});

describe("autoAreasCreatedRecently", () => {
  it("counts only the auto-created marker", () => {
    expect(
      autoAreasCreatedRecently([
        { entries: [{ message: "charter created" }, { message: "area auto-created x" }] },
        { entries: [{ message: "K-001 note added: thing" }] },
      ]),
    ).toBe(1);
  });
});

describe("createAreaGuarded", () => {
  let tmp: string;
  const prev = process.env.PLANNER_DATA_DIR;
  const longText = "a fact about travelling abroad for several weeks each year with family";

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "planner-mint-"));
    const git = simpleGit(tmp);
    await git.init();
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("user.name", "Test");
    process.env.PLANNER_DATA_DIR = tmp;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.PLANNER_DATA_DIR;
    else process.env.PLANNER_DATA_DIR = prev;
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
  });

  it("creates an area when nothing conflicts", async () => {
    const created = await createAreaGuarded("Travel", "Trips and logistics.", longText, []);
    expect(created?.id).toBe("travel");
    const areas = await listCharters("area");
    expect(areas.map((a) => a.id)).toContain("travel");
  });

  it("refuses a generic dumping-ground name", async () => {
    for (const name of NEVER_MINT.slice(0, 4)) {
      expect(await createAreaGuarded(name, "why", longText, [])).toBeNull();
    }
  });

  it("refuses when an existing charter is close enough to reuse", async () => {
    const existing = [charter({ id: "health", name: "Health" })];
    expect(await createAreaGuarded("Health", "why", longText, existing)).toBeNull();
    expect(await createAreaGuarded("Health markers", "why", longText, existing)).toBeNull();
  });

  it("refuses to mint from a one-liner too short to justify an area", async () => {
    expect(await createAreaGuarded("Travel", "why", "short note", [])).toBeNull();
  });

  it("refuses a second area within the budget window", async () => {
    expect(await createAreaGuarded("Travel", "why", longText, [])).not.toBeNull();
    const charters = await listCharters();
    expect(await createAreaGuarded("Cooking", "why", longText, charters)).toBeNull();
  });

  it("never overwrites an existing charter even if the guards are bypassed", async () => {
    await createCharter({ type: "area", name: "Health", why: "Original reason" });
    await expect(
      createCharter({ type: "area", name: "Health", why: "Replacement" }),
    ).rejects.toThrow(/already uses the slug/);
    const areas = await listCharters("area");
    expect(areas.find((a) => a.id === "health")?.why).toContain("Original reason");
  });
});
