import { describe, expect, it } from "vitest";
import { orphanReviewIds } from "./flashcards-upkeep-core";

describe("orphanReviewIds", () => {
  const rows = [
    { id: "r1", kind: "vocabulary" as const, cardKey: "aprovechar" },
    { id: "r2", kind: "vocabulary" as const, cardKey: "deleted word" },
    { id: "r3", kind: "mistake" as const, cardKey: "I have went → I have gone" },
    { id: "r4", kind: "mistake" as const, cardKey: "gone mistake → fixed" },
  ];

  it("returns only rows whose card key no longer exists", () => {
    const ids = orphanReviewIds(rows, {
      vocabulary: new Set(["aprovechar"]),
      mistake: new Set(["I have went → I have gone"]),
    });
    expect(ids).toEqual(["r2", "r4"]);
  });

  it("never touches decks it wasn't given keys for", () => {
    expect(orphanReviewIds(rows, { vocabulary: new Set(["aprovechar"]) })).toEqual(["r2"]);
    const other = [{ id: "x", kind: "tense" as never, cardKey: "anything" }];
    expect(orphanReviewIds(other, { vocabulary: new Set(), mistake: new Set() })).toEqual([]);
  });

  it("treats an empty source as every card being gone", () => {
    expect(orphanReviewIds(rows, { vocabulary: new Set(), mistake: new Set() })).toEqual(["r1", "r2", "r3", "r4"]);
  });
});
