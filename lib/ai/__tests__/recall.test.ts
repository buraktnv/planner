import { describe, expect, it } from "vitest";
import { latestUserText, recallQuery } from "../recall";

const userMsg = (text: string) => ({ role: "user", parts: [{ type: "text", text }] });
const botMsg = (text: string) => ({ role: "assistant", parts: [{ type: "text", text }] });

describe("latestUserText", () => {
  it("reads the AI SDK parts array", () => {
    expect(latestUserText([userMsg("my cholesterol came back high")])).toBe(
      "my cholesterol came back high",
    );
  });

  it("takes the last user message, skipping a trailing assistant turn", () => {
    expect(latestUserText([userMsg("first thing"), userMsg("second thing"), botMsg("reply")])).toBe(
      "second thing",
    );
  });

  it("joins multiple text parts", () => {
    expect(
      latestUserText([
        { role: "user", parts: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
      ]),
    ).toBe("a b");
  });

  it("ignores non-text parts", () => {
    expect(
      latestUserText([
        { role: "user", parts: [{ type: "file", url: "x" }, { type: "text", text: "hello there" }] },
      ]),
    ).toBe("hello there");
  });

  it("falls back to a plain string content", () => {
    expect(latestUserText([{ role: "user", content: "plain string" }])).toBe("plain string");
  });

  it("survives malformed input rather than throwing", () => {
    expect(latestUserText(undefined)).toBe("");
    expect(latestUserText("not an array")).toBe("");
    expect(latestUserText([null, 3, { role: "user" }])).toBe("");
    expect(latestUserText([{ role: "user", parts: "nope" }])).toBe("");
    expect(latestUserText([botMsg("only assistant")])).toBe("");
  });
});

describe("recallQuery", () => {
  it("passes a substantive message through", () => {
    expect(recallQuery([userMsg("my cholesterol came back high")])).toBe(
      "my cholesterol came back high",
    );
  });

  it("skips messages too short to retrieve on", () => {
    expect(recallQuery([userMsg("ok")])).toBeUndefined();
    expect(recallQuery([userMsg("what now")])).toBeUndefined();
  });

  it("skips greetings and acknowledgements", () => {
    expect(recallQuery([userMsg("thank you very much")])).toBeUndefined();
    expect(recallQuery([userMsg("good morning!")])).toBeUndefined();
  });

  it("is undefined when there is no user text", () => {
    expect(recallQuery([])).toBeUndefined();
  });
});
