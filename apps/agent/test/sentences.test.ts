import { describe, it, expect } from "vitest";
import { splitSentences, summarizeForSpeech } from "../src/voice/sentenceSplitter.js";

describe("sentence splitter (FR-VO-02)", () => {
  it("splits on boundaries", () => {
    expect(splitSentences("Hello world. How are you? Fine!")).toEqual(["Hello world.", "How are you?", "Fine!"]);
  });
  it("ignores common abbreviations", () => {
    const parts = splitSentences("See Dr. Smith today. Thanks.");
    expect(parts.join(" ")).toContain("Dr. Smith");
  });
  it("keeps e.g./decimals intact", () => {
    const parts = splitSentences("Use e.g. this. Pi is 3.14. Ship v1.2 today. Done.");
    expect(parts.join(" ")).toContain("3.14");
    expect(parts.join(" ")).toContain("v1.2");
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
  it("summarizes code blocks", () => {
    expect(summarizeForSpeech("```ts\nconst x=1\n```")).toContain("shown in UI");
  });
});
