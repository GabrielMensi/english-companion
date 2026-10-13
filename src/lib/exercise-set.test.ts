import { describe, expect, it } from "vitest";
import type { CategoryExerciseItem, CategoryPractice } from "./category-practice";
import {
  answerTemplate,
  completeSentence,
  gradeCategorySet,
  gradeTenseSet,
  mistakesByAnswer,
  parseAnswers,
  sameAnswer,
  setOpening,
  setSummary,
} from "./exercise-set";
import type { ExercisePractice } from "./tense-practice";

const texts = (text: string, count: number) => parseAnswers(text, count).map((a) => a?.text ?? null);

describe("parseAnswers", () => {
  it("reads numbered lines in any common style", () => {
    expect(texts("1. on\n2) at\n3 - in\n(4) for\n5: to\n6/6. of", 6)).toEqual(["on", "at", "in", "for", "to", "of"]);
  });

  it("reads lines without numbers in order, and bullets", () => {
    expect(texts("on\nat\n\n- in", 3)).toEqual(["on", "at", "in"]);
  });

  it("puts numbered answers in their place, out of order or with gaps", () => {
    expect(texts("3. in\n1. on", 3)).toEqual(["on", null, "in"]);
    expect(texts("1. on\nat\n4. for", 4)).toEqual(["on", "at", null, "for"]);
  });

  it("takes a bare number only when it's the next one", () => {
    expect(texts("1 on\n2 at", 2)).toEqual(["on", "at"]);
    expect(texts("10 people came to the party.", 2)).toEqual(["10 people came to the party.", null]);
  });

  it("splits numbered answers on a single line", () => {
    expect(texts("1. on 2. at 3) in", 3)).toEqual(["on", "at", "in"]);
  });

  it("splits a single line of short answers separated by commas", () => {
    expect(texts("on, at, in", 3)).toEqual(["on", "at", "in"]);
    // A sentence with a comma is one answer.
    expect(texts("Yesterday, I went to the office early.", 3)).toEqual([
      "Yesterday, I went to the office early.",
      null,
      null,
    ]);
  });

  it("treats empty lines, '?' and 'skip' as not answered, and ignores extra lines", () => {
    expect(texts("1. \n2. ?\n3. skip\n4. -\n5. on\n6. extra", 5)).toEqual([null, null, null, null, "on"]);
    expect(texts(answerTemplate(3), 3)).toEqual([null, null, null]);
  });

  it("keeps full sentences, numbers inside them included", () => {
    expect(texts("1. I have lived here since 2020.\n2. She called me at 5.", 2)).toEqual([
      "I have lived here since 2020.",
      "She called me at 5.",
    ]);
  });

  it("returns where each answer sits in the message", () => {
    const text = "1. on\n2. at";
    const [first, second] = parseAnswers(text, 2);
    expect(text.slice(first!.start, first!.end)).toBe("on");
    expect(text.slice(second!.start, second!.end)).toBe("at");
  });
});

describe("mistakesByAnswer", () => {
  it("places each mistake in the answer that contains it, in order", () => {
    const text = "1. I am agree with you.\n2. It depends of the weather.\n3. I am agree too.";
    const answers = parseAnswers(text, 3);
    const found = mistakesByAnswer(text, answers, [
      { category: "verb_form", original: "am agree" },
      { category: "prepositions", original: "of" },
      { category: "verb_form", original: "am agree" },
      { category: "articles", original: "not in the text" },
    ]);
    expect(found.map((m) => m.map((x) => x.category))).toEqual([["verb_form"], ["prepositions"], ["verb_form"]]);
  });
});

describe("completeSentence", () => {
  it("fills the gap with the missing words", () => {
    expect(
      completeSentence("I ___ (live) in Madrid since 2020.", "have lived", "I have lived in Madrid since 2020."),
    ).toBe("I have lived in Madrid since 2020.");
  });

  it("splits words between several gaps", () => {
    const sentence = "___ you ever ___ (be) to Japan?";
    expect(completeSentence(sentence, "Have / been", "Have you ever been to Japan?")).toBe(
      "Have you ever been to Japan?",
    );
    expect(completeSentence(sentence, "have been", "Have you ever been to Japan?")).toBe(
      "have you ever been to Japan?",
    );
  });

  it("keeps a full sentence that follows the exercise and rejects a different one", () => {
    expect(completeSentence("I ___ (live) here.", "I lived here.", "I have lived here.")).toBe("I lived here.");
    expect(
      completeSentence("I ___ (live) here.", "My family and I moved to this city in 2019.", "I have lived here."),
    ).toBeNull();
  });
});

describe("sameAnswer", () => {
  it("ignores case, punctuation and contractions, 's as is or has", () => {
    expect(sameAnswer("She's finished the report", "She has finished the report.")).toBe(true);
    expect(sameAnswer("He hasn't written it", "He has not written it.")).toBe(true);
    expect(sameAnswer("He wrote it", "He has written it.")).toBe(false);
  });
});

const fill: CategoryExerciseItem = {
  sentence: "My sister is ___ engineer.",
  answer: "My sister is an engineer.",
  why: "Profesiones llevan a/an.",
  format: "fill",
};
const choice: CategoryExerciseItem = {
  sentence: "It depends ___ (of / on / in) the weather.",
  answer: "It depends on the weather.",
  why: "Depend on.",
  format: "choice",
};
const rewrite: CategoryExerciseItem = {
  sentence: "Fix the mistake: I am agree with you.",
  answer: "I agree with you.",
  why: "Agree es un verbo.",
  format: "rewrite",
};
const category: CategoryPractice = {
  kind: "category",
  category: "articles",
  subtype: null,
  items: [fill, choice, rewrite],
};

describe("gradeCategorySet", () => {
  it("grades gap words, options and rewrites in one message", () => {
    const results = gradeCategorySet(category, "1. an\n2. of\n3. I agree with you.", []);
    expect(results.map((r) => r.mark)).toEqual(["right", "wrong", "right"]);
    expect(results[1].learnerAnswer).toBe("of");
  });

  it("uses the correction's mistakes inside each answer for rewrites", () => {
    const text = "1. an\n2. on\n3. I am totally agree with you.";
    const results = gradeCategorySet({ ...category, category: "verb_form" }, text, [
      { category: "verb_form", original: "am totally agree" },
    ]);
    expect(results.map((r) => r.mark)).toEqual(["right", "right", "wrong"]);
  });

  it("marks missing answers as not answered", () => {
    expect(gradeCategorySet(category, "1. an", []).map((r) => r.mark)).toEqual(["right", "unanswered", "unanswered"]);
  });
});

const tenseItem = (sentence: string, answer: string, tenses: ExercisePractice["items"][number]["tenses"]) => ({
  sentence,
  answer,
  why: "Porque sí.",
  tenses,
});

const contrast: ExercisePractice = {
  kind: "contrast",
  tense: "present_perfect",
  contrastWith: "past_simple",
  items: [
    tenseItem("I ___ (live) in Madrid since 2020.", "I have lived in Madrid since 2020.", ["present_perfect"]),
    tenseItem("She ___ (call) me yesterday.", "She called me yesterday.", ["past_simple"]),
    tenseItem("We ___ (not / finish) the project yet.", "We haven't finished the project yet.", ["present_perfect"]),
  ],
};

describe("gradeTenseSet", () => {
  it("grades contrast items by tense, from the missing words or the full sentence", () => {
    const results = gradeTenseSet(contrast, "1. live\n2. She called me yesterday.\n3. haven't finished", []);
    expect(results.map((r) => r.mark)).toEqual(["wrong", "right", "right"]);
    expect(results[0].note).toBe("This one needs the present perfect");
  });

  it("accepts the right tense with other words, as a suggestion", () => {
    const [first] = gradeTenseSet(contrast, "1. I have been in Madrid since 2020.", []);
    expect(first.mark).toBe("right");
    expect(first.exact).toBe(false);
  });

  it("marks the right tense with a verb mistake as wrong", () => {
    const text = "1. have lived\n2. called\n3. We have not finish the project yet.";
    const results = gradeTenseSet(contrast, text, [{ category: "verb_form", original: "have not finish" }]);
    expect(results.map((r) => r.mark)).toEqual(["right", "right", "wrong"]);
    expect(results[2].note).toBe("Right tense, wrong form");
  });

  it("needs the exact words in form drills", () => {
    const form: ExercisePractice = {
      kind: "form",
      tense: "present_perfect",
      contrastWith: null,
      items: [
        tenseItem("He ___ (not / write) the tests yet.", "He hasn't written the tests yet.", ["present_perfect"]),
        tenseItem("They ___ (buy) a new car.", "They have bought a new car.", ["present_perfect"]),
        tenseItem("She ___ (go) home.", "She has gone home.", ["present_perfect"]),
      ],
    };
    const text = "1. hasn't wrote\n2. have bought\n3. My sister went home early today.";
    const results = gradeTenseSet(form, text, [{ category: "verb_tense", original: "went" }]);
    expect(results.map((r) => r.mark)).toEqual(["wrong", "right", "wrong"]);
  });
});

describe("the set chat", () => {
  it("opens with every item numbered and how to answer", () => {
    const opening = setOpening("Let’s practice.", category.items);
    expect(opening).toContain(
      "1. My sister is ___ engineer.\n2. It depends ___ (of / on / in) the weather.\n3. Fix the mistake",
    );
    expect(opening).toContain("ONE message");
  });

  it("sums up each item, the score and the flashcards", () => {
    const summary = setSummary(gradeCategorySet(category, "1. an\n2. of", []));
    expect(summary).toContain("1. ✓ My sister is an engineer.\n   Profesiones llevan a/an.");
    expect(summary).toContain("2. ✗ You wrote: of — answer: It depends on the weather.");
    expect(summary).toContain("3. – Not answered — answer: I agree with you.");
    expect(summary).toContain("Score: 1/3 (1 not answered).");
    expect(summary).toContain("Missed exercises");
  });

  it("doesn't point to the flashcards when nothing was wrong", () => {
    expect(setSummary(gradeCategorySet(category, "an\non\nI agree with you.", []))).not.toContain("Missed exercises");
  });
});
