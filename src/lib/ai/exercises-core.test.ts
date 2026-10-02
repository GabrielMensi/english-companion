import { describe, expect, it } from "vitest";
import { buildExerciseInstructions, type ExerciseRequest, normalizeExercises } from "./exercises-core";

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
    expect(buildExerciseInstructions({ ...contrast, kind: "form", contrastWith: null })).toContain("FORM of the present perfect");
    expect(buildExerciseInstructions({ ...contrast, kind: "use", contrastWith: null, explanationLanguage: "en" })).toContain(
      "No gaps",
    );
  });
});

describe("normalizeExercises", () => {
  it("keeps valid items and works out the tense each answer needs", () => {
    const items = normalizeExercises(
      raw(["I ____ (live) here since 2020.", "I have lived here since 2020."], ["She ___ (call) me yesterday.", "She called me yesterday."]),
      contrast,
    );
    expect(items).toEqual([
      { sentence: "I ___ (live) here since 2020.", answer: "I have lived here since 2020.", why: "Porque sí.", tenses: ["present_perfect"] },
      { sentence: "She ___ (call) me yesterday.", answer: "She called me yesterday.", why: "Porque sí.", tenses: ["past_simple"] },
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
