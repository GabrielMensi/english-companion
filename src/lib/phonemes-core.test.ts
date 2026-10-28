import { describe, expect, it } from "vitest";
import { cmuLookup } from "./cmu-lookup";
import {
  alignTokens,
  analyzePhonemes,
  decodeCtc,
  type HeardPhone,
  parseWav,
  phonemeErrorRate,
  splitFused,
} from "./phonemes-core";

/** Recognizer output from space-separated sounds. */
const heard = (sounds: string): HeardPhone[] => sounds.split(" ").map((token, i) => ({ token, start: i, end: i }));
const analyze = (
  text: string,
  sounds: string,
  issues: { expected: string; category: "th_sounds" | "b_v" | "vowel_length" | "other" }[] = [],
) => analyzePhonemes(text, issues, heard(sounds), cmuLookup);

describe("parseWav", () => {
  function wav(samples: number[], rate = 16000, channels = 1) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const tag = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
    tag(0, "RIFF");
    v.setUint32(4, 36 + samples.length * 2, true);
    tag(8, "WAVE");
    tag(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, channels, true);
    v.setUint32(24, rate, true);
    v.setUint16(34, 16, true);
    tag(36, "data");
    v.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
    return new Uint8Array(buf);
  }

  it("reads 16-bit mono PCM", () => {
    const parsed = parseWav(wav([0, 16384, -32768], 16000));
    expect(parsed?.sampleRate).toBe(16000);
    expect([...parsed!.samples]).toEqual([0, 0.5, -1]);
  });

  it("refuses stereo, other formats and junk", () => {
    expect(parseWav(wav([0, 0], 16000, 2))).toBeNull();
    expect(parseWav(new Uint8Array(10))).toBeNull();
    expect(parseWav(new TextEncoder().encode("RIFF".padEnd(60, "x")))).toBeNull();
  });
});

describe("decodeCtc", () => {
  const vocab = { 0: "<pad>", 1: "<s>", 2: "t", 3: "ə" };
  // classes: pad, <s>, t, ə
  const frame = (cls: number) => [0, 1, 2, 3].map((c) => (c === cls ? 5 : 0));

  it("merges repeated frames, drops blanks and special tokens, keeps the frames", () => {
    const logits = [2, 2, 0, 3, 3, 3, 1, 2].flatMap(frame);
    expect(decodeCtc(logits, 8, 4, vocab)).toEqual([
      { token: "t", start: 0, end: 1 },
      { token: "ə", start: 3, end: 5 },
      { token: "t", start: 7, end: 7 },
    ]);
  });

  it("a blank between two equal sounds keeps both", () => {
    const logits = [2, 0, 2].flatMap(frame);
    expect(decodeCtc(logits, 3, 4, vocab).map((h) => h.token)).toEqual(["t", "t"]);
  });
});

describe("splitFused", () => {
  it("splits r-colored vowels and schwa + l, keeping their frames", () => {
    expect(
      splitFused([
        { token: "ɔːɹ", start: 2, end: 4 },
        { token: "əl", start: 5, end: 6 },
        { token: "t", start: 7, end: 7 },
      ]),
    ).toEqual([
      { token: "ɔː", start: 2, end: 4 },
      { token: "ɹ", start: 2, end: 4 },
      { token: "ə", start: 5, end: 6 },
      { token: "l", start: 5, end: 6 },
      { token: "t", start: 7, end: 7 },
    ]);
  });
});

describe("alignment", () => {
  it("lines up equal sounds and pairs a vowel with a vowel", () => {
    const { map, cost } = alignTokens(["b", "ə", "n"], ["b", "ɑː", "n"]);
    expect(map).toEqual([0, 1, 2]);
    expect(cost).toBe(1);
  });

  it("phoneme error rate", () => {
    expect(phonemeErrorRate(["a", "b"], ["a", "b"])).toBe(0);
    expect(phonemeErrorRate(["a", "b"], ["a"])).toBe(0.5);
  });
});

describe("schwa and weak forms", () => {
  it("is quiet when the reduced vowels are reduced", () => {
    // "I need to go home" with to as /tə/
    expect(analyze("I need to go home", "aɪ n iː d t ə ɡ oʊ h oʊ m").hints).toEqual([]);
  });

  it("flags a weak form said in full (to as /tuː/)", () => {
    expect(analyze("I need to go home", "aɪ n iː d t uː ɡ oʊ h oʊ m").hints).toEqual([
      { category: "schwa_reduction", word: "to", detail: "/ə/ → /uː/" },
    ]);
  });

  it("flags a full vowel in the unstressed syllables of a content word", () => {
    // banana: b ə n ˈæ n ə, said "ba-na-na"
    const hints = analyze("banana", "b ɑː n æ n ɑː").hints;
    expect(hints.map((h) => h.detail)).toEqual(["/ə/ → /ɑː/"]);
    expect(hints[0].word).toBe("banana");
  });

  it("accepts ɪ and ɐ for a reduced vowel and does not flag missing sounds", () => {
    expect(analyze("banana", "b ɐ n æ n ɐ").hints).toEqual([]);
    expect(analyze("banana", "n æ n").hints).toEqual([]);
  });

  it("does not check weak forms at the end of the sentence or before a vowel", () => {
    expect(analyze("I am waiting for", "aɪ æ m w eɪ ɾ ɪ ŋ f ɔː").hints).toEqual([]);
    expect(analyze("go to a party", "ɡ oʊ t uː ɐ p ɑː ɹ ɾ i").hints).toEqual([]);
  });
});

describe("checks on the transcript-based issues", () => {
  const issue = (expected: string, category: "th_sounds" | "b_v" | "vowel_length") => [{ expected, category }];

  it("confirms th heard as t and says what changed", () => {
    const a = analyze("I think so", "aɪ t ɪ ŋ k s oʊ", issue("think", "th_sounds"));
    expect(a.checks).toEqual([{ issue: 0, verdict: "confirmed", detail: "/θ/ → /t/" }]);
    // The word is flagged already: no extra hint for it.
    expect(a.hints).toEqual([]);
  });

  it("says when the sounds were right (the transcript misheard)", () => {
    const a = analyze("I think so", "aɪ θ ɪ ŋ k s oʊ", issue("think", "th_sounds"));
    expect(a.checks[0].verdict).toBe("not_heard");
  });

  it("is unclear when the sound is missing", () => {
    const a = analyze("I think so", "aɪ ɪ ŋ k s oʊ", issue("think", "th_sounds"));
    expect(a.checks[0].verdict).toBe("unclear");
  });

  it("b/v both ways, and vowel length", () => {
    expect(analyze("a very good boat", "ɐ b ɛ ɹ i ɡ ʊ d b oʊ t", issue("very", "b_v")).checks[0]).toEqual({
      issue: 0,
      verdict: "confirmed",
      detail: "/v/ → /b/",
    });
    expect(analyze("a very good boat", "ɐ v ɛ ɹ i ɡ ʊ d v oʊ t", issue("boat", "b_v")).checks[0].detail).toBe(
      "/b/ → /v/",
    );
    expect(analyze("the ship", "ð ə ʃ p", issue("ship", "vowel_length")).checks[0].verdict).toBe("unclear");
    expect(analyze("the ship", "ð ə ʃ iː p", issue("ship", "vowel_length")).checks[0]).toEqual({
      issue: 0,
      verdict: "confirmed",
      detail: "/ɪ/ → /iː/",
    });
  });
});

describe("extra findings", () => {
  it("adds th and b/v said wrong in words the transcript heard fine", () => {
    const hints = analyze("I think this is very good", "aɪ t ɪ ŋ k ð ɪ s ɪ z b ɛ ɹ i ɡ ʊ d").hints;
    expect(hints).toEqual([
      { category: "th_sounds", word: "think", detail: "/θ/ → /t/" },
      { category: "b_v", word: "very", detail: "/v/ → /b/" },
    ]);
  });
});

describe("weak forms and the recognizer's limits", () => {
  it("does not flag ʌ in was or of (the recognizer barely tells ə from ʌ)", () => {
    expect(analyze("It was good", "ɪ t w ʌ z ɡ ʊ d").hints).toEqual([]);
    expect(analyze("a cup of tea", "ɐ k ʌ p ʌ v t iː").hints).toEqual([]);
  });

  it("does not flag an r-colored schwa heard as ɜː", () => {
    expect(analyze("tea for two", "t iː f ɜː t uː").hints).toEqual([]);
  });

  it("stays quiet around a word the dictionary doesn't know", () => {
    const a = analyze("Ask Zorblax to call", "æ s k z ɔː b l æ k s t ə k ɔː l");
    expect(a.hints).toEqual([]);
    expect(analyze("Ask Zorblax to call", "æ s k z ɔː b l æ k s t uː k ɔː l").hints).toEqual([
      { category: "schwa_reduction", word: "to", detail: "/ə/ → /uː/" },
    ]);
  });

  it("picks the pronunciation that fits what was heard (record as noun or verb)", () => {
    // Noun: R EH1 K ER0 D, verb: R IH0 K AO1 R D.
    expect(analyze("a record", "ɐ ɹ ɛ k ɚ d").hints).toEqual([]);
    expect(analyze("to record it", "t ə ɹ ɪ k ɔː ɹ d ɪ t").hints).toEqual([]);
    // The noun's reduced vowel said in full is still found.
    expect(analyze("a record", "ɐ ɹ ɛ k ɔː ɹ d").hints.map((h) => h.word)).toEqual(["record"]);
  });

  it("the before a vowel can be heard as ðiː", () => {
    expect(analyze("the apple", "ð iː æ p əl").hints).toEqual([]);
  });
});
