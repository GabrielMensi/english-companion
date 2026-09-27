import { describe, expect, it } from "vitest";
import {
  type Analysis,
  buildAnalysisInstructions,
  buildAnalysisPrompt,
  containsLoosely,
  normalizeAnalysis,
  toSnakeCase,
} from "./analysis";

const base: Analysis = {
  correctedText: "I went to the park yesterday.",
  naturalText: null,
  errors: [],
  spanishPhrases: [],
  reply: null,
};

describe("normalizeAnalysis", () => {
  it("drops no-op and duplicated errors", () => {
    const error = {
      original: "I have went",
      correction: "I went",
      category: "verb_form" as const,
      subcategory: "Past Participle",
      severity: "moderate" as const,
      explanation: " ... ",
    };
    const result = normalizeAnalysis(
      { ...base, errors: [error, { ...error }, { ...error, original: "park", correction: "park" }] },
      "correction",
      "I have went to the park yesterday.",
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].subcategory).toBe("past_participle");
    expect(result.errors[0].explanation).toBe("...");
  });

  it("removes naturalText when it matches the correction", () => {
    const result = normalizeAnalysis({ ...base, naturalText: "i went to the park   yesterday." }, "correction", "x");
    expect(result.naturalText).toBeNull();
  });

  it("only keeps the reply in conversation mode", () => {
    expect(normalizeAnalysis({ ...base, reply: "Nice!" }, "correction", "x").reply).toBeNull();
    expect(normalizeAnalysis({ ...base, reply: "Nice!" }, "conversation", "x").reply).toBe("Nice!");
  });

  it("cleans spanish phrases", () => {
    const result = normalizeAnalysis(
      {
        ...base,
        spanishPhrases: [
          { spanish: "[aprovechar]", english: ["take advantage of", " make the most of ", "", "a", "b"], note: "" },
          { spanish: "algo", english: [], note: null },
        ],
      },
      "correction",
      "I want to [aprovechar] this and algo más",
    );
    expect(result.spanishPhrases).toEqual([
      { spanish: "aprovechar", english: ["take advantage of", "make the most of", "a"], note: null },
    ]);
  });

  it("falls back to the original text when the correction is empty", () => {
    expect(normalizeAnalysis({ ...base, correctedText: "  " }, "correction", "Hello").correctedText).toBe("Hello");
  });
});

describe("grounding", () => {
  const text = "Actually I depend of my team, and I want to [aprovechar] it.";

  it("drops errors whose fragment is not in the learner's text", () => {
    const error = { category: "prepositions" as const, subcategory: "x", severity: "minor" as const, explanation: "" };
    const result = normalizeAnalysis(
      {
        ...base,
        errors: [
          { ...error, original: "Depend of", correction: "depend on" },
          { ...error, original: "teh", correction: "the" },
        ],
      },
      "correction",
      text,
    );
    expect(result.errors.map((e) => e.original)).toEqual(["Depend of"]);
  });

  it("never reports [bracketed] vocabulary lookups as mistakes", () => {
    const error = { category: "vocabulary" as const, subcategory: "x", severity: "moderate" as const, explanation: "" };
    const result = normalizeAnalysis(
      {
        ...base,
        errors: [
          { ...error, original: "[aprovechar]", correction: "take advantage of" },
          { ...error, original: "aprovechar", correction: "make the most of" },
          { ...error, original: "depend of", correction: "depend on" },
        ],
      },
      "correction",
      text,
    );
    expect(result.errors.map((e) => e.original)).toEqual(["depend of"]);
  });

  it("only keeps vocabulary the learner wrote between [brackets]", () => {
    const phrase = { english: ["x"], note: null };
    const result = normalizeAnalysis(
      {
        ...base,
        spanishPhrases: [
          { ...phrase, spanish: "aprovechar" },
          { ...phrase, spanish: "Meaby" },
          { ...phrase, spanish: "configurated" },
        ],
      },
      "correction",
      "Meaby the models configurated as fallback can [aprovechar] it.",
    );
    expect(result.spanishPhrases.map((p) => p.spanish)).toEqual(["aprovechar"]);
  });

  it("drops spanish phrases that are not in the learner's text", () => {
    const phrase = { english: ["x"], note: null };
    const result = normalizeAnalysis(
      { ...base, spanishPhrases: [{ ...phrase, spanish: "aprovechar" }, { ...phrase, spanish: "actualmente" }] },
      "correction",
      text,
    );
    expect(result.spanishPhrases.map((p) => p.spanish)).toEqual(["aprovechar"]);
  });

  it("matches ignoring case, accents, spacing and edge punctuation", () => {
    expect(containsLoosely("Está  muy bien.", "esta muy BIEN")).toBe(true);
    expect(containsLoosely("I went home.", "home.")).toBe(true);
    expect(containsLoosely("I went home.", "house")).toBe(false);
    expect(containsLoosely("I went home.", "...")).toBe(false);
  });
});

describe("prompts", () => {
  it("asks for a reply only in conversation mode", () => {
    expect(buildAnalysisInstructions({ mode: "correction", explanationLanguage: "es" })).toContain("reply: always null");
    expect(buildAnalysisInstructions({ mode: "conversation", explanationLanguage: "en" })).toContain(
      "friendly conversation partner",
    );
  });

  it("includes history only in conversation mode", () => {
    const history = [{ learner: "Hi", assistant: "Hello! How are you?" }];
    expect(buildAnalysisPrompt({ text: "Fine", mode: "conversation", explanationLanguage: "es", history })).toContain(
      "You: Hello! How are you?",
    );
    expect(buildAnalysisPrompt({ text: "Fine", mode: "correction", explanationLanguage: "es", history })).not.toContain(
      "Conversation so far",
    );
  });
});

describe("toSnakeCase", () => {
  it("normalizes free-form labels", () => {
    expect(toSnakeCase("Present Perfect vs. Past Simple")).toBe("present_perfect_vs_past_simple");
    expect(toSnakeCase("missingArticle")).toBe("missing_article");
    expect(toSnakeCase("preposición")).toBe("preposicion");
  });
});
