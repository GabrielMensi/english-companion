import { describe, expect, it } from "vitest";
import {
  buildCategoryExerciseInstructions,
  buildExerciseInstructions,
  type CategoryExerciseRequest,
  type ExerciseRequest,
  normalizeCategoryExercises,
  normalizeExercises,
} from "./exercises-core";

const contrast: ExerciseRequest = {
  kind: "contrast",
  tense: "present_perfect",
  contrastWith: "past_simple",
  explanationLanguage: "es",
  count: 3,
};

const raw = (...items: [string, string][]) => ({
  items: items.map(([sentence, answer]) => ({ sentence, answer, why: " Porque sí. " })),
});

describe("buildExerciseInstructions", () => {
  it("describes a contrast set with the clue words for the pair", () => {
    const instructions = buildExerciseInstructions(contrast);
    expect(instructions).toContain("contrast the present perfect");
    expect(instructions).toContain("with the past simple");
    expect(instructions).toContain("since, for, ever");
    expect(instructions).toContain("exactly 3 items");
    expect(instructions).toContain("Spanish");
  });

  it("describes form drills and use tasks", () => {
    expect(buildExerciseInstructions({ ...contrast, kind: "form", contrastWith: null })).toContain(
      "FORM of the present perfect",
    );
    expect(
      buildExerciseInstructions({ ...contrast, kind: "use", contrastWith: null, explanationLanguage: "en" }),
    ).toContain("No gaps");
  });
});

describe("normalizeExercises", () => {
  it("keeps valid items and works out the tense each answer needs", () => {
    const items = normalizeExercises(
      raw(
        ["I ____ (live) here since 2020.", "I have lived here since 2020."],
        ["She ___ (call) me yesterday.", "She called me yesterday."],
      ),
      contrast,
    );
    expect(items).toEqual([
      {
        sentence: "I ___ (live) here since 2020.",
        answer: "I have lived here since 2020.",
        why: "Porque sí.",
        tenses: ["present_perfect"],
      },
      {
        sentence: "She ___ (call) me yesterday.",
        answer: "She called me yesterday.",
        why: "Porque sí.",
        tenses: ["past_simple"],
      },
    ]);
  });

  it("drops items without a gap, unfilled answers, duplicates and answers in another tense", () => {
    const items = normalizeExercises(
      raw(
        ["I live here since 2020.", "I have lived here since 2020."],
        ["I ___ (live) here since 2020.", "I ___ here since 2020."],
        ["They ___ (go) to Rome.", "They are going to Rome."],
        ["We ___ (finish) it.", "We have finished it."],
        ["We ___ (finish) it.", "We finished it."],
      ),
      contrast,
    );
    expect(items.map((i) => i.answer)).toEqual(["We have finished it."]);
  });

  it("doesn't require gaps in use tasks and caps the count", () => {
    const items = normalizeExercises(
      raw(
        ["Write about a trip you have taken.", "I have been to Rome twice."],
        ["Write about a film you have seen.", "I have seen Dune three times."],
        ["Write about a book you have read.", "I have read all of Borges."],
        ["Write about a city you have visited.", "I have visited Lisbon."],
      ),
      { ...contrast, kind: "use", contrastWith: null },
    );
    expect(items).toHaveLength(3);
  });
});

describe("category exercises", () => {
  const request: CategoryExerciseRequest = {
    category: "prepositions",
    subtype: "dependent_preposition",
    explanationLanguage: "es",
    mistakes: [{ original: "depend of", correction: "depend on" }],
    count: 6,
  };

  it("describes the category, the focus, the formats and the learner's mistakes", () => {
    const instructions = buildCategoryExerciseInstructions(request);
    expect(instructions).toContain("practice prepositions");
    expect(instructions).toContain("Focus on this type of mistake: Verb / adjective + preposition");
    expect(instructions).toContain("2 fill-in-the-gap, 2 multiple choice, 2 fix-the-mistake");
    expect(instructions).toContain('"depend of" → "depend on"');
    expect(instructions).toContain("Spanish");
    expect(buildCategoryExerciseInstructions({ ...request, subtype: null, mistakes: [] })).toContain(
      "Time (in / on / at)",
    );
  });

  it("keeps valid items of each format and drops broken ones", () => {
    const items = normalizeCategoryExercises(
      {
        items: [
          {
            sentence: "She is interested ____ machine learning.",
            options: "",
            answer: "She is interested in machine learning.",
            why: " Rule. ",
          },
          {
            sentence: "It depends ___ the weather.",
            options: "of / on/in",
            answer: "It depends on the weather.",
            why: "",
          },
          // Options already in the sentence.
          { sentence: "He is good ___ (at / in) maths.", options: "at / in", answer: "He is good at maths.", why: "" },
          {
            sentence: "Fix the mistake: We discussed about the plan.",
            options: "",
            answer: "We discussed the plan.",
            why: "",
          },
          // The answer doesn't follow the sentence.
          { sentence: "He is good ___ chess.", options: "", answer: "She is good at chess.", why: "" },
          // The answer isn't one of the options.
          { sentence: "I arrived ___ (to / at) the office.", options: "", answer: "I arrived in the office.", why: "" },
          // Nothing to fix.
          { sentence: "Fix the mistake: I agree.", options: "", answer: "I agree.", why: "" },
          // The gap is left empty.
          { sentence: "We discussed ___ the plan.", options: "", answer: "We discussed the plan.", why: "" },
          // Duplicate.
          {
            sentence: "She is interested ___ machine learning.",
            options: "",
            answer: "She is interested in machine learning.",
            why: "",
          },
        ],
      },
      request,
    );
    expect(items).toEqual([
      {
        sentence: "She is interested ___ machine learning.",
        answer: "She is interested in machine learning.",
        why: "Rule.",
        format: "fill",
      },
      {
        sentence: "It depends ___ (of / on / in) the weather.",
        answer: "It depends on the weather.",
        why: "",
        format: "choice",
      },
      { sentence: "He is good ___ (at / in) maths.", answer: "He is good at maths.", why: "", format: "choice" },
      {
        sentence: "Fix the mistake: We discussed about the plan.",
        answer: "We discussed the plan.",
        why: "",
        format: "rewrite",
      },
    ]);
  });
});
