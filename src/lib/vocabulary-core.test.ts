import { describe, expect, it } from "vitest";
import { groupVocabulary, type VocabularyRow, wordKey } from "./vocabulary-core";

function row(partial: Partial<VocabularyRow>): VocabularyRow {
  return {
    id: "v1",
    spanish: "aprovechar",
    english: ["take advantage of"],
    note: null,
    createdAt: 1000,
    messageId: "m1",
    sessionId: "s1",
    context: "I want to take advantage of this.",
    ...partial,
  };
}

describe("wordKey", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(wordKey("  Está   bien ")).toBe("esta bien");
  });
});

describe("groupVocabulary", () => {
  it("groups repeated lookups and keeps the latest translation", () => {
    const words = groupVocabulary([
      row({ id: "a", createdAt: 1000, english: ["old"] }),
      row({ id: "b", createdAt: 3000, spanish: "Aprovechar", english: ["make the most of"], messageId: "m2" }),
      row({ id: "c", createdAt: 2000, spanish: "suficiente", english: ["enough"] }),
    ]);

    expect(words.map((w) => w.key)).toEqual(["aprovechar", "suficiente"]);
    expect(words[0]).toMatchObject({
      spanish: "Aprovechar",
      english: ["make the most of"],
      timesLookedUp: 2,
      firstSeen: 1000,
      lastSeen: 3000,
    });
    expect(words[0].ids.sort()).toEqual(["a", "b"]);
    expect(words[0].contexts.map((c) => c.messageId)).toEqual(["m2", "m1"]);
  });

  it("keeps at most 3 distinct contexts", () => {
    const rows = [1, 2, 3, 4].map((i) => row({ id: `v${i}`, createdAt: i, messageId: `m${i}` }));
    rows.push(row({ id: "dup", createdAt: 5, messageId: "m4" }));
    const [word] = groupVocabulary(rows);
    expect(word.timesLookedUp).toBe(5);
    expect(word.contexts.map((c) => c.messageId)).toEqual(["m4", "m3", "m2"]);
  });
});
