import { describe, expect, it } from "vitest";
import {
  catalogItems,
  collectMentions,
  commandOf,
  filterMentionItems,
  insertMention,
  mentionHref,
  mentionQueryAt,
  splitMentions,
  type MentionCatalog,
} from "../mentions";

const catalog: MentionCatalog = {
  notes: [
    { id: "K-001", title: "Grid strategy postmortem" },
    { id: "K-012", title: "Passport renewal" },
  ],
  tasks: [
    { type: "project", slug: "acme-bot", id: "T-007", title: "Wire the laptop", charterName: "Acme Bot" },
    { type: "project", slug: "acme-bot", id: "T-007.2", title: "Install tailscale", charterName: "Acme Bot" },
    { type: "area", slug: "health", id: "T-007", title: "Book the dentist", charterName: "Health" },
  ],
  charters: [
    { type: "project", slug: "acme-bot", name: "Acme Bot" },
    { type: "area", slug: "health", name: "Health" },
  ],
};

describe("mentionQueryAt", () => {
  it("finds the @word the caret is inside", () => {
    expect(mentionQueryAt("look at @K-0", 12)).toEqual({ start: 8, trigger: "@", query: "K-0" });
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, trigger: "@", query: "" });
  });

  it("returns null when the caret is not in a token", () => {
    expect(mentionQueryAt("plain text", 10)).toBeNull();
    expect(mentionQueryAt("mail me@example.com", 19)).toBeNull();
    expect(mentionQueryAt("@K-001 then", 11)).toBeNull();
  });

  it("only treats / as a command at the start of the message", () => {
    expect(mentionQueryAt("/che", 4)).toEqual({ start: 0, trigger: "/", query: "che" });
    expect(mentionQueryAt("see /che", 8)).toBeNull();
  });
});

describe("filterMentionItems", () => {
  const items = catalogItems(catalog);

  it("ranks an id prefix above a title prefix above a substring", () => {
    const out = filterMentionItems(items, "@", "k-0");
    expect(out.map((i) => i.token)).toEqual(["@K-001", "@K-012"]);
    const byTitle = filterMentionItems(items, "@", "pass");
    expect(byTitle[0].token).toBe("@K-012");
    const inWord = filterMentionItems(items, "@", "lap");
    expect(inWord[0].token).toBe("@T-007");
  });

  it("offers everything on an empty query, capped", () => {
    expect(filterMentionItems(items, "@", "", 3)).toHaveLength(3);
    expect(filterMentionItems(items, "@", "")).toHaveLength(7);
  });

  it("offers only commands for a slash", () => {
    const out = filterMentionItems(items, "/", "");
    expect(out.map((i) => i.token)).toEqual(["/checkin"]);
    expect(filterMentionItems(items, "/", "zzz")).toEqual([]);
  });
});

describe("insertMention", () => {
  it("replaces the query with the token and a space, caret after both", () => {
    const item = catalogItems(catalog)[2];
    const out = insertMention("see @K-0 now", 4, 8, item);
    expect(out).toEqual({ text: "see @K-001 now", caret: 11 });
  });

  it("does not double a space that is already there", () => {
    const item = catalogItems(catalog)[2];
    expect(insertMention("@K", 0, 2, item).text).toBe("@K-001 ");
  });
});

describe("collectMentions", () => {
  it("resolves notes, tasks and charters that exist, and drops the rest", () => {
    const out = collectMentions("@K-001 and @K-999 and @acme-bot and @nobody and @T-007.2", catalog);
    expect(out).toEqual([
      { kind: "note", id: "K-001" },
      { kind: "charter", type: "project", slug: "acme-bot" },
      { kind: "task", type: "project", slug: "acme-bot", id: "T-007.2" },
    ]);
  });

  it("prefers the focused charter for an ambiguous task id", () => {
    expect(collectMentions("@T-007", catalog, { type: "area", slug: "health" })).toEqual([
      { kind: "task", type: "area", slug: "health", id: "T-007" },
    ]);
    expect(collectMentions("@T-007", catalog)[0]).toMatchObject({ slug: "acme-bot" });
  });

  it("ignores emails and repeated tokens", () => {
    expect(collectMentions("me@K-001 nope", catalog)).toEqual([]);
    expect(collectMentions("@K-001 @K-001", catalog)).toHaveLength(1);
  });
});

describe("splitMentions and mentionHref", () => {
  it("splits a message into runs and tokens", () => {
    expect(splitMentions("fix @T-007 per @K-001.")).toEqual([
      { type: "text", text: "fix " },
      { type: "mention", token: "@T-007", ref: "T-007" },
      { type: "text", text: " per " },
      { type: "mention", token: "@K-001", ref: "K-001" },
      { type: "text", text: "." },
    ]);
  });

  it("links what exists and not what does not", () => {
    expect(mentionHref("K-001", catalog)).toBe("/knowledge/K-001");
    expect(mentionHref("T-007.2", catalog)).toBe("/projects/acme-bot/tasks/T-007.2");
    expect(mentionHref("health", catalog)).toBe("/areas/health");
    expect(mentionHref("nobody", catalog)).toBeNull();
  });
});

describe("commandOf", () => {
  it("reads a known command and the text after it", () => {
    expect(commandOf("/checkin")).toEqual({ name: "checkin", rest: "" });
    expect(commandOf("  /checkin rough day  ")).toEqual({ name: "checkin", rest: "rough day" });
    expect(commandOf("/nope")).toBeNull();
    expect(commandOf("not /checkin")).toBeNull();
  });
});
