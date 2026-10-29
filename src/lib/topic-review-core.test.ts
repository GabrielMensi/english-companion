import { describe, expect, it } from "vitest";

import {
  buildFeedbackPrompt,
  containsPhrase,
  introducedDetails,
  isGrounded,
  normalizeFeedback,
  normalizePhrases,
  TopicToolError,
  type ReviewTurn,
} from "./topic-review-core";

const turns: ReviewTurn[] = [
  {
    question: "Tell me about a project you are proud of.",
    text: "I have worked in a payments project. I lead the team of four people.",
    spoken: false,
    natural: null,
    mistakes: [{ id: "m1", original: "I lead the team", correction: "I led the team", category: "verb_tense" }],
  },
  {
    question: "What was hard?",
    text: "The deadline was very tight and I lead the migration alone.",
    spoken: true,
    natural: "The deadline was very tight, and I led the migration on my own.",
    mistakes: [
      { id: "m2", original: "I lead the migration", correction: "I led the migration", category: "verb_tense" },
    ],
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
    expect(prompt).toContain('[m1] "I lead the team" -> "I led the team" (Verb tenses)');
    expect(prompt).toContain("Learner said (dictated): The deadline");
  });

  it("keeps the end of a long tutor message, where the question is", () => {
    const long = [{ ...turns[0], question: `${"Background. ".repeat(60)}So, what was your role?` }];
    const prompt = buildFeedbackPrompt("Interview", long);
    expect(prompt).toContain("what was your role?");
    expect(prompt).toContain("Tutor asked: …");
  });
});

describe("introducedDetails", () => {
  const sources = ["I led the migration at Acme with 4 people", "Tell me about Kubernetes"];

  it("finds numbers and names the sources never mention", () => {
    expect(introducedDetails("You managed 12 engineers at Amazon.", sources)).toEqual(["12", "Amazon"]);
  });

  it("ignores sentence starts, I, and details that are in the sources", () => {
    expect(introducedDetails("Clear answer. I think Acme and Kubernetes fit, with 4 people.", sources)).toEqual([]);
  });
});

describe("introducedDetails with valid feedback", () => {
  const sources = [
    "I worked with react and aws for two years, I used the api",
    "yesterday I go to the office in monday",
  ];
  const clean = (text: string, counts = 0) => introducedDetails(text, sources, counts);

  it.each([
    ["Spanish openings with ¡ and ¿", "¡Buen trabajo! Usaste bien el Present Perfect."],
    ["a question opening", "¿Notaste que repetiste el error?"],
    ["tense names", "You used the Past Simple well."],
    ["language names", "You mixed Spanish word order."],
    ["a possessive", "Good use of React's hooks."],
    ["a plural of a learner's word", "You explained the APIs clearly."],
    ["a dash opening", "Your answer — Great structure."],
    ["lowercase learner terms", "Good use of React and AWS."],
  ])("accepts %s", (_name, text) => {
    expect(clean(text)).toEqual([]);
  });

  it("allows small counts about the review, not facts", () => {
    expect(clean("En el mensaje 2 usaste bien el pasado.", 3)).toEqual([]);
    expect(clean("Repetiste este error 3 veces.", 3)).toEqual([]);
    expect(clean("Repetiste este error 3 veces.")).toEqual(["3"]);
    expect(clean("Managed 12 engineers.", 3)).toEqual(["12"]);
  });
});

describe("normalizeFeedback", () => {
  const raw = {
    overall: "  Good effort. You worked at Amazon for 10 years. ",
    strengths: ["Clear structure", "Great metrics about Google", " "],
    recurringMistakes: [
      { pattern: "Past simple of lead", mistakeId: "m2" },
      { pattern: "Made up", mistakeId: "m9" },
    ],
    betterAnswers: [
      { answer: "The deadline was very tight", better: "We had a very tight deadline." },
      { answer: "The deadline was very tight", better: "We had a tight deadline and saved 30% at Amazon." },
      { answer: "I worked at Amazon for ten years", better: "I spent ten years there." },
    ],
  };

  it("keeps what is in the conversation and drops invented details", () => {
    const feedback = normalizeFeedback(raw, turns);
    expect(feedback.overall).toBe("Good effort.");
    expect(feedback.strengths).toEqual(["Clear structure"]);
    expect(feedback.recurringMistakes).toEqual([{ pattern: "Past simple of lead", example: "I lead the migration" }]);
    expect(feedback.betterAnswers).toEqual([
      { answer: "The deadline was very tight", better: "We had a very tight deadline." },
    ]);
  });

  it("only reports a mistake whose category happened at least twice", () => {
    const once = turns.map((t, i) => (i === 1 ? { ...t, mistakes: [{ ...t.mistakes[0], category: "articles" }] } : t));
    expect(normalizeFeedback(raw, once).recurringMistakes).toEqual([]);
  });

  it("keeps Spanish feedback with Spanish punctuation, tense names and small counts", () => {
    const feedback = normalizeFeedback(
      {
        overall: "¡Buen trabajo! Repetiste el mismo error 2 veces.",
        strengths: ["Usaste bien el Past Simple."],
        recurringMistakes: [],
        betterAnswers: [],
      },
      turns,
    );
    expect(feedback.overall).toBe("¡Buen trabajo! Repetiste el mismo error 2 veces.");
    expect(feedback.strengths).toEqual(["Usaste bien el Past Simple."]);
  });

  it("fails with a plain message when nothing usable is left", () => {
    expect(() =>
      normalizeFeedback({ overall: "", strengths: [], recurringMistakes: [], betterAnswers: [] }, turns),
    ).toThrow(TopicToolError);
  });
});

describe("containsPhrase", () => {
  it("matches whole words only", () => {
    expect(containsPhrase("An accurate answer", "rate")).toBe(false);
    expect(containsPhrase("What is the rate?", "the rate")).toBe(true);
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
