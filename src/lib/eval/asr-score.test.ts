import { describe, expect, it } from "vitest";
import { ASR_SAMPLES } from "./asr-samples";
import { normalizeTranscript, scoreTranscript, wordErrorRate } from "./asr-score";

const sample = ASR_SAMPLES.find((s) => s.id === "have-went")!;

describe("scoreTranscript", () => {
  it("detects a kept mistake", () => {
    expect(scoreTranscript(sample, "Yesterday I have went to the park with my friends.")).toEqual({
      outcome: "kept",
      wer: 0,
    });
  });

  it("detects a mistake the transcriber fixed", () => {
    expect(scoreTranscript(sample, "Yesterday, I went to the park with my friends!").outcome).toBe("fixed");
  });

  it("reports a lost mistake when neither form is there", () => {
    expect(scoreTranscript(sample, "Yesterday I haven't gone to the park").outcome).toBe("lost");
  });

  it("checks the fix first when it contains the mistake", () => {
    const important = ASR_SAMPLES.find((s) => s.id === "is-important")!;
    expect(scoreTranscript(important, "It's very important to test this feature.").outcome).toBe("fixed");
    expect(scoreTranscript(important, "Is very important to test this feature.").outcome).toBe("kept");
  });

  it("matches whole words only", () => {
    const he = ASR_SAMPLES.find((s) => s.id === "he-go")!;
    expect(scoreTranscript(he, "My brother goes to the gym every morning.").outcome).toBe("fixed");
  });

  it("treats contractions and digits like the spelled-out forms", () => {
    const dont = ASR_SAMPLES.find((s) => s.id === "she-dont")!;
    expect(scoreTranscript(dont, "She do not like working on weekends").outcome).toBe("kept");
    const since = ASR_SAMPLES.find((s) => s.id === "since-2020")!;
    expect(scoreTranscript(since, "I live in this city since 2020.")).toEqual({ outcome: "kept", wer: 0 });
  });
});

describe("wordErrorRate", () => {
  it("counts substitutions, insertions and deletions", () => {
    expect(wordErrorRate("a b c d", "a x c d")).toBe(0.25);
    expect(wordErrorRate("a b c d", "a b c d e")).toBe(0.25);
    expect(wordErrorRate("a b c d", "a c d")).toBe(0.25);
    expect(wordErrorRate("a b", "")).toBe(1);
  });
});

describe("normalizeTranscript", () => {
  it("drops punctuation and case", () => {
    expect(normalizeTranscript("Hello, World!  It's me.")).toBe("hello world it is me");
  });
});
