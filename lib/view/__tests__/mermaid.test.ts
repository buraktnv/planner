import { describe, expect, it } from "vitest";
import { diagramsIn, hasDiagram, isMermaidFence } from "../mermaid";

describe("isMermaidFence", () => {
  it("matches the class react-markdown puts on a mermaid fence", () => {
    expect(isMermaidFence("language-mermaid")).toBe(true);
    expect(isMermaidFence("hljs language-mermaid")).toBe(true);
    expect(isMermaidFence("language-mermaid extra")).toBe(true);
  });

  it("does not match another language, or a prefix of the word", () => {
    expect(isMermaidFence("language-ts")).toBe(false);
    expect(isMermaidFence("language-mermaidish")).toBe(false);
    expect(isMermaidFence("mermaid")).toBe(false);
  });

  it("survives a missing or non-string class", () => {
    expect(isMermaidFence(undefined)).toBe(false);
    expect(isMermaidFence(null)).toBe(false);
    expect(isMermaidFence(42)).toBe(false);
  });
});

describe("diagramsIn", () => {
  const body = [
    "How the BT works.",
    "",
    "```mermaid",
    "flowchart TD",
    "  Root --> Sel",
    "```",
    "",
    "And some code:",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "~~~mermaid",
    "graph LR",
    "~~~",
  ].join("\n");

  it("finds every mermaid block in document order", () => {
    expect(diagramsIn(body)).toEqual(["flowchart TD\n  Root --> Sel", "graph LR"]);
  });

  it("ignores fences in another language", () => {
    expect(diagramsIn(body).join("\n")).not.toContain("const x");
  });

  it("is empty for a note with no diagram", () => {
    expect(diagramsIn("just prose")).toEqual([]);
    expect(diagramsIn("")).toEqual([]);
  });

  it("keeps an unclosed fence, so a note being typed does not flicker", () => {
    expect(diagramsIn("```mermaid\nflowchart TD")).toEqual(["flowchart TD"]);
  });

  it("drops an empty diagram rather than reporting one", () => {
    expect(diagramsIn("```mermaid\n```")).toEqual([]);
    expect(diagramsIn("```mermaid\n\n\n```")).toEqual([]);
  });

  it("handles CRLF", () => {
    expect(diagramsIn("```mermaid\r\ngraph LR\r\n```")).toEqual(["graph LR"]);
  });

  it("is not confused by an info string with trailing spaces", () => {
    expect(diagramsIn("```mermaid  \ngraph LR\n```")).toEqual(["graph LR"]);
  });

  it("does not treat a fence inside a mermaid block as a language switch", () => {
    expect(diagramsIn("```mermaid\ngraph LR\n```\n```ts\nx\n```")).toEqual(["graph LR"]);
  });
});

describe("hasDiagram", () => {
  it("answers the canvas card's question without rendering anything", () => {
    expect(hasDiagram("```mermaid\ngraph LR\n```")).toBe(true);
    expect(hasDiagram("prose")).toBe(false);
    expect(hasDiagram(null)).toBe(false);
    expect(hasDiagram(undefined)).toBe(false);
  });
});
