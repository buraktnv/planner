import { describe, expect, it } from "vitest";
import { insertAtCursor } from "../insert-at-cursor";

const IMG = "![](assets/abc123.png)";

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
