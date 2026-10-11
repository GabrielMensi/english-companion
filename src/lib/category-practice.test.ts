import { describe, expect, it } from "vitest";
import {
  acceptedAnswers,
  type CategoryExerciseItem,
  type CategoryPractice,
  categoryExerciseIntro,
  categoryPracticeTitle,
  checkCategoryAnswer,
  formatOf,
  gapFills,
  parseGaps,
  rewriteSource,
  selectCategoryTargets,
  SUGGESTED_CATEGORY_TARGETS,
  validSubtype,
} from "./category-practice";
import type { CategoryStat, Stats } from "./stats-core";

function category(partial: Partial<CategoryStat> & Pick<CategoryStat, "category">): CategoryStat {
  return {
    count: 0,
    score: 0,
    per100Words: 0,
    trend: null,
    bySeverity: { suggestion: 0, typo: 0, minor: 0, moderate: 0, major: 0 },
    topSubtypes: [],
    ...partial,
  };
}

const stats = (categories: CategoryStat[], topMistakes: Stats["topMistakes"] = []) => ({ categories, topMistakes });

describe("selectCategoryTargets", () => {
  it("suggests common problems when there is no data", () => {
    expect(selectCategoryTargets(stats([]))).toEqual(SUGGESTED_CATEGORY_TARGETS);
    expect(selectCategoryTargets(stats([category({ category: "articles", count: 1, per100Words: 0.1 })]))).toEqual(
      SUGGESTED_CATEGORY_TARGETS,
    );
  });

  it("ranks by mistakes per 100 words and skips categories that aren't drilled", () => {
    const targets = selectCategoryTargets(
      stats([
        category({ category: "verb_tense", count: 20, per100Words: 3, score: 40 }),
        category({ category: "spelling", count: 15, per100Words: 2.5 }),
        category({ category: "articles", count: 5, per100Words: 0.8, score: 10 }),
        category({ category: "prepositions", count: 8, per100Words: 1.2, score: 9 }),
        category({ category: "pronouns", count: 3, per100Words: 0.4 }),
        category({ category: "collocations", count: 2, per100Words: 0.3 }),
      ]),
    );
    expect(targets.map((t) => t.category)).toEqual(["prepositions", "articles", "pronouns"]);
    expect(targets.every((t) => t.status === "weak")).toBe(true);
    expect(targets[0].reason).toContain("1.2 per 100 words (8 mistakes)");
  });

  it("focuses on the most frequent type, with a real example", () => {
    const [target] = selectCategoryTargets(
      stats(
        [
          category({
            category: "prepositions",
            count: 6,
            per100Words: 1,
            topSubtypes: [
              { subtype: "dependent_preposition", count: 4 },
              { subtype: "time", count: 2 },
            ],
          }),
        ],
        [
          {
            category: "prepositions",
            subtype: "dependent_preposition",
            subcategory: "x",
            count: 4,
            example: { original: "depend of", correction: "depend on", explanation: "" },
          },
        ],
      ),
    );
    expect(target).toMatchObject({ category: "prepositions", subtype: "dependent_preposition" });
    expect(target.reason).toContain("most often: verb / adjective + preposition");
    expect(target.reason).toContain("“depend of” → “depend on”");
  });

  it("doesn't focus on 'other' or on a type seen once", () => {
    const [a] = selectCategoryTargets(
      stats([
        category({ category: "articles", count: 4, per100Words: 1, topSubtypes: [{ subtype: "other", count: 3 }] }),
      ]),
    );
    expect(a.subtype).toBeNull();
    const [b] = selectCategoryTargets(
      stats([
        category({ category: "articles", count: 4, per100Words: 1, topSubtypes: [{ subtype: "a_vs_the", count: 1 }] }),
      ]),
    );
    expect(b.subtype).toBeNull();
  });
});

describe("gaps", () => {
  it("parses options and hints after the gaps", () => {
    expect(parseGaps("It depends ___ (of / on / in) the weather.")).toEqual({
      parts: ["It depends ", " the weather."],
      options: [["of", "on", "in"]],
    });
    expect(parseGaps("I enjoy ___ (read) at night.").options).toEqual([[]]);
  });

  it("finds what fills the gaps, ignoring case, punctuation and contractions", () => {
    expect(gapFills("My sister is ___ engineer.", "My sister is an engineer.")).toEqual(["an"]);
    expect(gapFills("It depends ___ (of / on / in) the weather.", "it depends on the weather")).toEqual(["on"]);
    expect(gapFills("___ you mind ___ (open) the window?", "Would you mind opening the window?")).toEqual([
      "would",
      "opening",
    ]);
    expect(gapFills("I don't ___ coffee.", "I do not like coffee.")).toEqual(["like"]);
    expect(gapFills("My sister is ___ engineer.", "She is an engineer.")).toBeNull();
    expect(gapFills("No gap here.", "No gap here.")).toBeNull();
  });

  it("infers the format", () => {
    expect(formatOf("I am ___ engineer.")).toBe("fill");
    expect(formatOf("I enjoy ___ (read).")).toBe("fill");
    expect(formatOf("Good ___ (at / in) maths.")).toBe("choice");
    expect(formatOf("Fix the mistake: I am agree.")).toBe("rewrite");
  });

  it("extracts the wrong sentence of a rewrite item", () => {
    expect(rewriteSource("Fix the mistake: “I am agree with you.”")).toBe("I am agree with you.");
    expect(rewriteSource("Correct this sentence: He explained me the plan.")).toBe("He explained me the plan.");
  });

  it("accepts the sentence or just the missing words on flashcards", () => {
    expect(acceptedAnswers({ sentence: "I am ___ engineer.", answer: "I am an engineer." })).toEqual([
      "I am an engineer.",
      "an",
    ]);
    expect(acceptedAnswers({ sentence: "Fix the mistake: I am agree.", answer: "I agree." })).toEqual(["I agree."]);
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
  why: "",
  format: "choice",
};
const rewrite: CategoryExerciseItem = {
  sentence: "Fix the mistake: I am agree with you.",
  answer: "I agree with you.",
  why: "",
  format: "rewrite",
};
const clean = { categoryErrors: 0, errors: 0 };

describe("checkCategoryAnswer", () => {
  it("checks gap items by what fills the gap", () => {
    expect(checkCategoryAnswer("My sister is an engineer.", fill, clean)).toBe("exact");
    expect(checkCategoryAnswer("my sister is an engineer", fill, clean)).toBe("exact");
    expect(checkCategoryAnswer("My sister is a engineer.", fill, clean)).toBe("wrong");
    expect(checkCategoryAnswer("My sister is engineer.", fill, clean)).toBe("wrong");
  });

  it("accepts just the missing word", () => {
    expect(checkCategoryAnswer("on", choice, clean)).toBe("exact");
    expect(checkCategoryAnswer("of", choice, clean)).toBe("wrong");
  });

  it("falls back to the correction when the answer doesn't follow the sentence", () => {
    expect(checkCategoryAnswer("Whether we go depends of the weather.", choice, { categoryErrors: 1, errors: 1 })).toBe(
      "wrong",
    );
    expect(checkCategoryAnswer("Whether we go depends on the weather.", choice, clean)).toBe("unknown");
  });

  it("checks rewrites with the correction", () => {
    expect(checkCategoryAnswer("I agree with you!", rewrite, clean)).toBe("exact");
    expect(checkCategoryAnswer("I am agree with you.", rewrite, clean)).toBe("wrong");
    expect(checkCategoryAnswer("I totally agree with you.", rewrite, clean)).toBe("right");
    expect(checkCategoryAnswer("I'm agreeing with you.", rewrite, { categoryErrors: 1, errors: 1 })).toBe("wrong");
    expect(checkCategoryAnswer("I agre with you.", rewrite, { categoryErrors: 0, errors: 1 })).toBe("unknown");
  });
});

describe("category exercise chat", () => {
  const practice: CategoryPractice = {
    kind: "category",
    category: "articles",
    subtype: "missing_a_an",
    items: [fill, choice, rewrite],
  };

  it("explains the formats in the set", () => {
    const intro = categoryExerciseIntro(practice);
    expect(intro).toContain("Let’s practice articles: missing a / an: 3 short exercises");
    expect(intro).toContain("fill in the gap, choose the right option or fix the mistake");
    expect(categoryPracticeTitle(practice)).toBe("Practice: articles: missing a / an");
  });
});

describe("validSubtype", () => {
  it("keeps only types of the category", () => {
    expect(validSubtype("articles", "missing_a_an")).toBe("missing_a_an");
    expect(validSubtype("articles", "time")).toBeNull();
    expect(validSubtype("articles", null)).toBeNull();
  });
});
