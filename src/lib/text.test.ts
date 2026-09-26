import { describe, expect, it } from "vitest";
import { countWords, makeTitle } from "./text";

describe("countWords", () => {
  it("counts words, including contractions and hyphenated words", () => {
    expect(countWords("I don't like well-known places.")).toBe(5);
  });

  it("ignores code blocks and inline code", () => {
    expect(countWords("Run `pnpm dev` then:\n```\nconst a = 1\n```\nand check it")).toBe(5);
  });
});

describe("makeTitle", () => {
  it("keeps short text as is", () => {
    expect(makeTitle("  Hello   world ")).toBe("Hello world");
  });

  it("cuts long text at a word boundary", () => {
    const title = makeTitle("This is a very long message that should be shortened for the sidebar");
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(49);
    expect(title).not.toMatch(/\s…$/);
  });
});
