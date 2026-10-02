import { describe, expect, it } from "vitest";
import {
  checkAnswer,
  conversationPracticeRule,
  type ExerciseItem,
  type ExercisePractice,
  exerciseOpening,
  exerciseReply,
  focusTenses,
  isTenseMiss,
  pickQuestion,
  practiceTitle,
  practiceTopic,
  selectPracticeTargets,
  SUGGESTED_TARGETS,
  TENSE_QUESTIONS,
} from "./tense-practice";
import type { TenseStat } from "./tense-stats";
import { TENSES } from "./taxonomy";

function stat(partial: Partial<TenseStat> & Pick<TenseStat, "tense">): TenseStat {
  return {
    uses: 20,
    usageErrors: 0,
    formErrors: 0,
    accuracy: 100,
    smoothedAccuracy: 95,
    trend: null,
    status: "strong",
    confusedWith: [],
    ...partial,
  };
}

const confusion = (tense: TenseStat["tense"], count: number) => ({
  tense,
  count,
  example: { original: "I live here since 2020", correction: "I have lived here since 2020" },
});

describe("selectPracticeTargets", () => {
  it("suggests the classic confusions when there is no data", () => {
    expect(selectPracticeTargets([])).toEqual(SUGGESTED_TARGETS);
    expect(selectPracticeTargets([stat({ tense: "present_simple" })])).toEqual(SUGGESTED_TARGETS);
  });

  it("picks a contrast exercise with the tense used instead when the problem is choosing it", () => {
    const [target] = selectPracticeTargets([
      stat({ tense: "present_simple" }),
      stat({
        tense: "present_perfect",
        uses: 12,
        usageErrors: 5,
        formErrors: 1,
        accuracy: 50,
        smoothedAccuracy: 50,
        status: "weak",
        confusedWith: [confusion("past_simple", 3), confusion("present_simple", 2)],
      }),
    ]);
    expect(target).toMatchObject({ tense: "present_perfect", contrastWith: "past_simple", kind: "contrast", status: "weak" });
    expect(target.reason).toContain("past simple instead 3 times");
  });

  it("picks a form drill when the tense is chosen right but built wrong", () => {
    const [target] = selectPracticeTargets([
      stat({ tense: "present_perfect", uses: 10, formErrors: 3, accuracy: 70, smoothedAccuracy: 67, status: "weak" }),
    ]);
    expect(target).toMatchObject({ tense: "present_perfect", contrastWith: null, kind: "form" });
  });

  it("makes the learner use a tense they avoid", () => {
    const [target] = selectPracticeTargets([
      stat({ tense: "past_continuous", uses: 1, accuracy: null, smoothedAccuracy: 67, status: "avoided" }),
    ]);
    expect(target).toMatchObject({ tense: "past_continuous", kind: "use", status: "avoided" });
    expect(target.reason).toContain("once");
  });

  it("ranks by mistakes plus a bonus for weak and rarely used tenses", () => {
    const targets = selectPracticeTargets(
      [
        stat({ tense: "future_will", uses: 20, formErrors: 3, smoothedAccuracy: 82, status: "shaky" }),
        stat({ tense: "past_perfect", uses: 0, smoothedAccuracy: 50, status: "avoided" }),
        stat({ tense: "past_simple", uses: 30, formErrors: 8, smoothedAccuracy: 72, status: "weak" }),
        stat({ tense: "present_simple", uses: 40, formErrors: 1, smoothedAccuracy: 95, status: "strong" }),
      ],
      5,
    );
    expect(targets.map((t) => t.tense)).toEqual(["past_simple", "future_will", "past_perfect"]);
  });

  it("includes tenses with few uses only when they already have several mistakes", () => {
    const targets = selectPracticeTargets([
      stat({ tense: "past_perfect", uses: 3, formErrors: 1, accuracy: null, smoothedAccuracy: 60, status: "not_enough_data" }),
      stat({
        tense: "past_simple",
        uses: 4,
        usageErrors: 2,
        accuracy: null,
        smoothedAccuracy: 50,
        status: "not_enough_data",
        confusedWith: [confusion("present_simple", 2)],
      }),
    ]);
    expect(targets.map((t) => t.tense)).toEqual(["past_simple"]);
  });

  it("doesn't repeat the same pair of tenses the other way round", () => {
    const targets = selectPracticeTargets([
      stat({ tense: "present_perfect", usageErrors: 4, smoothedAccuracy: 60, status: "weak", confusedWith: [confusion("past_simple", 4)] }),
      stat({ tense: "past_simple", usageErrors: 2, smoothedAccuracy: 70, status: "weak", confusedWith: [confusion("present_perfect", 2)] }),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ tense: "present_perfect", contrastWith: "past_simple" });
  });

  it("respects the limit", () => {
    const stats = (["past_simple", "present_perfect", "past_continuous", "future_will"] as const).map((tense) =>
      stat({ tense, formErrors: 2, smoothedAccuracy: 70, status: "weak" }),
    );
    expect(selectPracticeTargets(stats, 2)).toHaveLength(2);
  });
});

describe("conversation practice", () => {
  it("has questions for every tense", () => {
    for (const tense of TENSES) expect(TENSE_QUESTIONS[tense].length).toBeGreaterThan(0);
  });

  it("avoids questions already asked", () => {
    const [first, second] = TENSE_QUESTIONS.present_perfect;
    const question = pickQuestion("present_perfect", [first, second], () => 0);
    expect(question).toBe(TENSE_QUESTIONS.present_perfect[2]);
    expect(TENSE_QUESTIONS.present_perfect).toContain(pickQuestion("present_perfect", [...TENSE_QUESTIONS.present_perfect]));
  });

  it("asks the model for follow-up questions that need the tense, without mentioning grammar", () => {
    const rule = conversationPracticeRule("past_continuous");
    expect(rule).toContain("past continuous");
    expect(rule).toContain("What were you doing");
    expect(rule).toContain("never mention grammar");
  });

  it("titles practice chats", () => {
    expect(practiceTitle({ kind: "contrast", tense: "present_perfect", contrastWith: "past_simple" })).toBe(
      "Practice: present perfect vs past simple",
    );
    expect(practiceTitle({ kind: "conversation", tense: "past_continuous", contrastWith: null })).toBe("Talk: past continuous");
  });
});

const item = (sentence: string, answer: string, tenses: ExerciseItem["tenses"] = []): ExerciseItem => ({
  sentence,
  answer,
  why: "Since + a starting point needs the present perfect.",
  tenses,
});

const contrast: ExercisePractice = {
  kind: "contrast",
  tense: "present_perfect",
  contrastWith: "past_simple",
  items: [
    item("I ___ (live) in Madrid since 2020.", "I have lived in Madrid since 2020.", ["present_perfect"]),
    item("She ___ (call) me yesterday.", "She called me yesterday.", ["past_simple"]),
  ],
};

describe("checkAnswer", () => {
  const focus = focusTenses(contrast);

  it("accepts the exact answer, ignoring case, punctuation and contractions", () => {
    expect(checkAnswer("i've lived in madrid since 2020", contrast.items[0], focus)).toBe("exact");
  });

  it("accepts a different sentence in the right tense", () => {
    expect(checkAnswer("I have been in Madrid since 2020.", contrast.items[0], focus)).toBe("right_tense");
  });

  it("flags the wrong tense", () => {
    expect(checkAnswer("I lived in Madrid since 2020.", contrast.items[0], focus)).toBe("wrong_tense");
    expect(checkAnswer("She has called me yesterday.", contrast.items[1], focus)).toBe("wrong_tense");
  });

  it("can't tell when there's no verb in a practiced tense", () => {
    expect(checkAnswer("Madrid", contrast.items[0], focus)).toBe("unknown");
  });

  it("measures present continuous for the future as present continuous", () => {
    expect(focusTenses({ tense: "future_present_continuous", contrastWith: "future_going_to" })).toEqual([
      "present_continuous",
      "future_going_to",
    ]);
  });
});

describe("exerciseReply", () => {
  it("opens with the instructions and the first item", () => {
    const opening = exerciseOpening(contrast);
    expect(opening).toContain("present perfect vs the past simple");
    expect(opening).toContain("1/2. I ___ (live) in Madrid since 2020.");
  });

  it("gives feedback on the answer and the next item", () => {
    const reply = exerciseReply({ practice: contrast, index: 0, learnerText: "I live in Madrid since 2020.", previousChecks: [] });
    expect(reply?.check).toBe("wrong_tense");
    expect(reply?.text).toContain("✗ This one needs the present perfect: I have lived in Madrid since 2020.");
    expect(reply?.text).toContain(contrast.items[0].why);
    expect(reply?.text).toContain("2/2. She ___ (call) me yesterday.");
  });

  it("sums up after the last item", () => {
    const reply = exerciseReply({
      practice: contrast,
      index: 1,
      learnerText: "She called me yesterday.",
      previousChecks: ["wrong_tense"],
    });
    expect(reply?.text).toContain("✓ Correct!");
    expect(reply?.text).toContain("the right tense in 1 of 2");
  });

  it("shows the answer in form drills, where the tense is given, and scores exact answers", () => {
    const form: ExercisePractice = {
      kind: "form",
      tense: "present_perfect",
      contrastWith: null,
      items: [item("He ___ (not / write) the tests yet.", "He hasn't written the tests yet.", ["present_perfect"])],
    };
    const reply = exerciseReply({ practice: form, index: 0, learnerText: "He hasn't wrote the tests yet.", previousChecks: [] });
    expect(reply?.text).toContain("Answer: He hasn't written the tests yet.");
    expect(reply?.text).not.toContain("✓");
    expect(reply?.text).toContain("exactly right in 0 of 1");
  });

  it("returns null past the last item", () => {
    expect(exerciseReply({ practice: contrast, index: 2, learnerText: "Anything", previousChecks: [] })).toBeNull();
  });

  it("shows the example answer for tasks it can't grade", () => {
    const use: ExercisePractice = {
      kind: "use",
      tense: "past_perfect",
      contrastWith: null,
      items: [item("Write about something you had done before 9 am yesterday.", "I had already walked the dog.")],
    };
    const reply = exerciseReply({ practice: use, index: 0, learnerText: "Nothing special", previousChecks: [] });
    expect(reply?.check).toBe("unknown");
    expect(reply?.text).toContain("Example: I had already walked the dog.");
    expect(reply?.text).toContain("That’s the whole set.");
  });
});

describe("isTenseMiss", () => {
  it("saves wrong tenses and form drill answers with verb mistakes, never open tasks", () => {
    expect(isTenseMiss("contrast", "wrong_tense", 0)).toBe(true);
    expect(isTenseMiss("contrast", "right_tense", 1)).toBe(false);
    expect(isTenseMiss("form", "right_tense", 1)).toBe(true);
    expect(isTenseMiss("form", "exact", 0)).toBe(false);
    expect(isTenseMiss("form", "unknown", 0)).toBe(false);
    expect(isTenseMiss("use", "wrong_tense", 2)).toBe(false);
  });

  it("names the topic for the flashcards", () => {
    expect(practiceTopic({ kind: "contrast", tense: "present_perfect", contrastWith: "past_simple" })).toBe(
      "Present perfect vs past simple",
    );
  });
});
