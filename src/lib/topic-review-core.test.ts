import { describe, expect, it } from "vitest";
import {
  buildFeedbackPrompt,
  isGrounded,
  normalizeFeedback,
  normalizePhrases,
  type ReviewTurn,
} from "./topic-review-core";

const turns: ReviewTurn[] = [
  {
    question: "Tell me about a project you are proud of.",
    text: "I have worked in a payments project. I lead the team of four people.",
    natural: null,
    mistakes: [{ original: "I lead the team", correction: "I led the team", category: "verb_tense" }],
  },
  {
    question: "What was hard?",
    text: "The deadline was very tight and I lead the migration alone.",
    natural: "The deadline was very tight, and I led the migration on my own.",
    mistakes: [{ original: "I lead the migration", correction: "I led the migration", category: "verb_tense" }],
  },
];

describe("isGrounded", () => {
  it("ignores case, quotes and ending punctuation", () => {
    expect(
      isGrounded(
        "“The deadline was very tight.”",
        turns.map((t) => t.text),
      ),
    ).toBe(true);
  });

  it("rejects text that is not in the sources and very short quotes", () => {
    expect(
      isGrounded(
        "I worked at Google",
        turns.map((t) => t.text),
      ),
    ).toBe(false);
    expect(
      isGrounded(
        "I",
        turns.map((t) => t.text),
      ),
    ).toBe(false);
  });
});

describe("buildFeedbackPrompt", () => {
  it("includes the questions, messages, native versions and mistakes", () => {
    const prompt = buildFeedbackPrompt("Interview", turns);
    expect(prompt).toContain("Tutor asked: What was hard?");
    expect(prompt).toContain("Native version: The deadline");
    expect(prompt).toContain('"I lead the team" -> "I led the team" (Verb tenses)');
  });
});

describe("normalizeFeedback", () => {
  const raw = {
    overall: "  Good effort. ",
    strengths: ["Clear structure", " "],
    recurringMistakes: [
      { pattern: "Past simple of lead", example: "I lead the migration" },
      { pattern: "Invented", example: "I managed a Google project" },
    ],
    betterAnswers: [
      { answer: "The deadline was very tight", better: "We had a very tight deadline." },
      { answer: "I worked at Amazon for ten years", better: "I spent ten years at Amazon." },
    ],
  };

  it("keeps what is in the conversation and drops invented quotes", () => {
    const feedback = normalizeFeedback(raw, turns);
    expect(feedback.overall).toBe("Good effort.");
    expect(feedback.strengths).toEqual(["Clear structure"]);
    expect(feedback.recurringMistakes.map((m) => m.pattern)).toEqual(["Past simple of lead"]);
    expect(feedback.betterAnswers.map((b) => b.answer)).toEqual(["The deadline was very tight"]);
  });

  it("fails when nothing usable is left", () => {
    expect(() =>
      normalizeFeedback({ overall: "", strengths: [], recurringMistakes: [], betterAnswers: [] }, turns),
    ).toThrow();
  });
});

describe("normalizePhrases", () => {
  const sources = [
    { messageId: "a1", text: "Could you walk me through your approach to code reviews?" },
    { messageId: "m2", text: "The deadline was very tight, and I led the migration on my own." },
  ];

  it("keeps grounded phrases with their message, once each, skipping saved and invented ones", () => {
    const result = normalizePhrases(
      {
        phrases: [
          { phrase: "walk me through", spanish: "explicarme paso a paso" },
          { phrase: "Walk me through.", spanish: "duplicado" },
          { phrase: "on my own", spanish: "por mi cuenta" },
          { phrase: "tight deadline", spanish: "plazo ajustado" },
          { phrase: "code reviews", spanish: "revisiones de código" },
          { phrase: "the deadline was very tight", spanish: "ya guardada" },
        ],
      },
      sources,
      new Set(["code reviews", "the deadline was very tight"]),
    );
    expect(result).toEqual([
      { phrase: "walk me through", spanish: "explicarme paso a paso", messageId: "a1" },
      { phrase: "on my own", spanish: "por mi cuenta", messageId: "m2" },
    ]);
  });
});
