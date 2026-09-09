import { describe, expect, it } from "vitest";
import { insertAtCursor, replacePlaceholder } from "../insert-at-cursor";

const IMG = "![](assets/abc123.png)";
const HOLD = "![uploading…](pending:1)";

describe("insertAtCursor", () => {
  it("inserts into empty text with no padding", () => {
    const out = insertAtCursor("", 0, 0, IMG);
    expect(out.text).toBe(IMG);
    expect(out.cursor).toBe(IMG.length);
  });

  it("inserts at the start, pushing the rest onto its own line", () => {
    const out = insertAtCursor("hello", 0, 0, IMG);
    expect(out.text).toBe(`${IMG}\nhello`);
    expect(out.cursor).toBe(IMG.length);
  });

  it("inserts in the middle on a line of its own", () => {
    const out = insertAtCursor("ab\ncd", 3, 3, IMG);
    expect(out.text).toBe(`ab\n${IMG}\ncd`);
    expect(out.cursor).toBe(3 + IMG.length);
  });

  it("inserts at the end", () => {
    const out = insertAtCursor("hello", 5, 5, IMG);
    expect(out.text).toBe(`hello\n${IMG}`);
    expect(out.cursor).toBe("hello\n".length + IMG.length);
  });

  it("replaces a selection", () => {
    const out = insertAtCursor("one two three", 4, 7, IMG);
    expect(out.text).toBe(`one \n${IMG}\n three`);
  });

  it("adds no newline when one is already there", () => {
    const out = insertAtCursor("a\n\nb", 2, 2, IMG);
    expect(out.text).toBe(`a\n${IMG}\nb`);
    expect(out.cursor).toBe(2 + IMG.length);
  });

  it("clamps positions outside the text", () => {
    expect(insertAtCursor("ab", -5, 99, IMG).text).toBe(IMG);
    expect(insertAtCursor("ab", 9, 2, IMG).text).toBe(`ab\n${IMG}`);
  });
});

describe("replacePlaceholder", () => {
  it("swaps the placeholder for the snippet", () => {
    expect(replacePlaceholder(`a\n${HOLD}\nb`, HOLD, IMG)).toBe(`a\n${IMG}\nb`);
  });

  it("keeps text typed on either side while the upload ran", () => {
    const during = `intro\n${HOLD}\nand a caption typed while it uploaded`;
    expect(replacePlaceholder(during, HOLD, IMG)).toBe(
      `intro\n${IMG}\nand a caption typed while it uploaded`,
    );
  });

  it("removes the placeholder and its line when the snippet is empty", () => {
    expect(replacePlaceholder(`a\n${HOLD}\nb`, HOLD, "")).toBe("a\nb");
    expect(replacePlaceholder(`a\n${HOLD}`, HOLD, "")).toBe("a");
    expect(replacePlaceholder(HOLD, HOLD, "")).toBe("");
  });

  it("leaves the text alone when the placeholder has been deleted", () => {
    expect(replacePlaceholder("nothing here", HOLD, IMG)).toBe("nothing here");
  });

  it("replaces only the first occurrence, so a second upload keeps its own", () => {
    const two = `${HOLD}\n![uploading…](pending:2)`;
    expect(replacePlaceholder(two, HOLD, IMG)).toBe(`${IMG}\n![uploading…](pending:2)`);
  });

  it("treats a $ in the snippet as text, not a replacement pattern", () => {
    expect(replacePlaceholder(HOLD, HOLD, "![](assets/a$&b.png)")).toBe("![](assets/a$&b.png)");
  });
});
