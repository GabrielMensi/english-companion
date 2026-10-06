import { describe, expect, it } from "vitest";
import { cmuLookup } from "./cmu-lookup";
import { classifyMismatch, scoreReading, speechWords } from "./pronunciation-core";
import { SOUND_SENTENCES } from "./read-aloud-sentences";

const classify = (expected: string, heard: string) => classifyMismatch(expected.split(" "), heard.split(" "), cmuLookup);

describe("speechWords", () => {
  it("lowercases, spells out small numbers and expands contractions", () => {
    expect(speechWords("I think it's 3. Don't won't can't!")).toEqual([
      "i", "think", "it", "is", "three", "do", "not", "will", "not", "cannot",
    ]);
  });

  it("splits hyphens and keeps possessives", () => {
    expect(speechWords("A well-known teacher's book — really")).toEqual(["a", "well", "known", "teacher's", "book", "really"]);
  });
});

describe("classifyMismatch", () => {
  it.each([
    ["ship", "sheep", "vowel_length", "/ɪ/ → /iː/"],
    ["full", "fool", "vowel_length", "/ʊ/ → /uː/"],
    ["call", "kill", "vowel_quality", "/ɔ/ → /ɪ/"],
    ["bug", "book", "vowel_quality", "/ʌ/ → /ʊ/"],
    ["think", "sink", "th_sounds", "/θ/ → /s/"],
    ["they", "day", "th_sounds", "/ð/ → /d/"],
    ["vote", "boat", "b_v", "/v/ → /b/"],
    ["hate", "eight", "h_j_sounds", "/h/ dropped"],
    ["yes", "jess", "h_j_sounds", "/j/ → /dʒ/"],
    ["worked", "work", "final_consonants", "/t/ dropped"],
    ["bed", "bet", "final_consonants", "/d/ → /t/"],
    ["student", "estudent", "initial_s_cluster", "extra /ɛ/"],
  ])("%s heard as %s is %s", (expected, heard, category, detail) => {
    expect(classify(expected, heard)).toEqual({ category, detail });
  });

  it("doesn't count homophones or spelling variants", () => {
    expect(classify("two", "too")).toBeNull();
    expect(classify("colour", "color")).toBeNull();
    expect(classify("some one", "someone")).toBeNull();
  });

  it("falls back to other for words the dictionary doesn't know", () => {
    expect(classify("kubernetes", "cooper")).toEqual({ category: "other", detail: null });
  });
});

describe("scoreReading", () => {
  it("marks every word right when it was heard as written", () => {
    const result = scoreReading("I think it's three.", "I think it's 3.", cmuLookup);
    expect(result).toMatchObject({ correctWords: 5, totalWords: 5, issues: [], missedWords: [] });
    expect(result.tokens.map((t) => t.text).join("")).toBe("I think it's three.");
  });

  it("finds the word heard differently and keeps the rest", () => {
    const result = scoreReading("I'll call you later.", "I'll kill you later.", cmuLookup);
    expect(result.issues).toEqual([{ expected: "call", heard: "kill", category: "vowel_quality", detail: "/ɔ/ → /ɪ/" }]);
    expect(result.tokens.filter((t) => t.status === "wrong").map((t) => t.text)).toEqual(["call"]);
    expect(result.correctWords).toBe(4);
  });

  it("treats contractions and homophones as the same reading", () => {
    expect(scoreReading("It is right.", "It's write.", cmuLookup).issues).toEqual([]);
  });

  it("marks words that weren't heard as missed, without an issue", () => {
    const result = scoreReading("Please don't sit on that seat.", "Please don't sit on seat.", cmuLookup);
    expect(result.missedWords).toEqual(["that"]);
    expect(result.issues).toEqual([]);
    expect(result.tokens.find((t) => t.text === "that")?.status).toBe("missed");
  });

  it("reads an extra word before an s + consonant as the added e", () => {
    const result = scoreReading("Students study a lot.", "Is students study a lot.", cmuLookup);
    expect(result.issues).toEqual([
      { expected: "students", heard: "is students", category: "initial_s_cluster", detail: "extra /ɛ/" },
    ]);
  });

  it("compares a word heard as two together", () => {
    const result = scoreReading("He is an engineer.", "He is an in jeer.", cmuLookup);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].expected).toBe("engineer");
    expect(result.issues[0].heard).toBe("in jeer");
  });
});

describe("SOUND_SENTENCES", () => {
  it("only uses words the dictionary knows, so every mistake can be classified", () => {
    const unknown = Object.values(SOUND_SENTENCES)
      .flat()
      .flatMap((s) => speechWords(s.text))
      .filter((w) => !cmuLookup(w));
    expect(unknown).toEqual([]);
  });

  it("puts the target word in its sentence", () => {
    for (const s of Object.values(SOUND_SENTENCES).flat()) expect(speechWords(s.text)).toContain(s.target);
  });

  it("classifies each minimal pair as its own category", () => {
    for (const [category, sentences] of Object.entries(SOUND_SENTENCES)) {
      for (const s of sentences) expect(classify(s.target, s.confusedWith)?.category, `${s.target} / ${s.confusedWith}`).toBe(category);
    }
  });
});
