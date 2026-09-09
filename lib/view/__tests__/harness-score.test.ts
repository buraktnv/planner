import { describe, expect, it } from "vitest";
import { scoreReply, resultFor, aggregate } from "../harness-score";

describe("scoreReply", () => {
  it("returns nothing missing when every keyword appears", () => {
    expect(scoreReply("Task lines live in tasks.md.", ["tasks.md"])).toEqual([]);
  });

  it("is case-insensitive both ways", () => {
    expect(scoreReply("The DELIMITER is checked by parseTasks.", ["delimiter", "ParseTasks"])).toEqual(
      [],
    );
  });

  it("names only the keywords that are missing", () => {
    expect(scoreReply("Only the owner may.", ["nobody", "proposal", "owner"])).toEqual([
      "nobody",
      "proposal",
    ]);
  });

  it("matches inside a word, so a keyword need not be a whole token", () => {
    expect(scoreReply("It writes projects/acme-bot/tasks.md", ["acme-bot"])).toEqual([]);
  });

  it("ignores a blank keyword rather than failing on it", () => {
    expect(scoreReply("anything", ["  "])).toEqual([]);
  });

  it("treats an empty reply as missing everything", () => {
    expect(scoreReply("", ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("resultFor and aggregate", () => {
  it("passes only when nothing is missing", () => {
    expect(resultFor("Where?", "in tasks.md", ["tasks.md"])).toEqual({
      q: "Where?",
      missing: [],
      pass: true,
    });
    expect(resultFor("Where?", "somewhere", ["tasks.md"]).pass).toBe(false);
  });

  it("counts the passes", () => {
    const results = [
      resultFor("a", "yes", ["yes"]),
      resultFor("b", "no", ["yes"]),
      resultFor("c", "yes", ["yes"]),
    ];
    expect(aggregate(results)).toEqual({ passed: 2, total: 3, allPassed: false });
  });

  it("an all-green run is all-green, and an empty run is not a failure", () => {
    expect(aggregate([resultFor("a", "yes", ["yes"])]).allPassed).toBe(true);
    expect(aggregate([])).toEqual({ passed: 0, total: 0, allPassed: true });
  });
});
