import { describe, expect, it } from "vitest";
import {
  applyCorrection,
  buildQueue,
  checkAnswer,
  deckCounts,
  filterMistakes,
  maskTerms,
  sentenceAround,
  type MistakeCard,
  mistakeCards,
  type MistakeRow,
  type QueuedCard,
  vocabularyCards,
} from "./flashcards-core";
import type { ReviewState } from "./srs";
import type { VocabularyWord } from "./vocabulary-core";

const NOW = 1_000_000;

function mistake(partial: Partial<MistakeRow>): MistakeRow {
  return {
    id: "c1",
    original: "I have went",
    correction: "I have gone",
    explanation: "Participio de go.",
    category: "verb_form",
    subtype: "past_participle",
    tense: "present_perfect",
    createdAt: 1000,
    sessionId: "s1",
    sentence: "Yesterday I have went to the park.",
    ...partial,
  };
}

function state(partial: Partial<ReviewState>): ReviewState {
  return { ease: 2.5, intervalDays: 1, repetitions: 1, lapses: 0, dueAt: NOW, ...partial };
}

describe("maskTerms", () => {
  it("blanks every accepted translation, longest first and case-insensitive", () => {
    expect(maskTerms("Even so, I went. even so!", ["even", "Even so"])).toBe("_____, I went. _____!");
  });

  it("leaves the text alone without terms", () => {
    expect(maskTerms("Hello", ["", " "])).toBe("Hello");
  });
});

describe("applyCorrection", () => {
  it("fixes only the given mistake", () => {
    expect(applyCorrection("He go and he go.", "he go", "he goes")).toBe("He go and he goes.");
    expect(applyCorrection("Nothing here", "missing", "x")).toBe("Nothing here");
  });
});

describe("sentenceAround", () => {
  const message = "Hi there! Yesterday I have went to the park.\nIt was great. Really.";

  it("keeps only the sentence with the fragment", () => {
    expect(sentenceAround(message, ["I have  went"])).toBe("Yesterday I have went to the park.");
    expect(sentenceAround(message, ["missing", "was GREAT"])).toBe("It was great.");
    expect(sentenceAround("just one line", ["one"])).toBe("just one line");
  });

  it("cuts a long sentence around the fragment", () => {
    const long = `${"a ".repeat(100)}the mistake here ${"b ".repeat(100)}`;
    const result = sentenceAround(long, ["the mistake here"], 40);
    expect(result).toContain("the mistake here");
    expect(result.startsWith("…") && result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(44);
  });

  it("truncates the text when the fragment isn't there", () => {
    expect(sentenceAround("x".repeat(50), ["y"], 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("vocabularyCards", () => {
  const word: VocabularyWord = {
    key: "incluso",
    spanish: "Incluso",
    english: ["Even so", "Actually"],
    source: "app",
    note: null,
    timesLookedUp: 2,
    firstSeen: 1,
    lastSeen: 2,
    ids: ["a", "b"],
    contexts: [
      { messageId: "m2", sessionId: "s2", text: "No translation used here." },
      { messageId: "m1", sessionId: "s1", text: "Actually, I liked it." },
    ],
  };

  it("uses a sentence that contains the English as a masked hint", () => {
    const [card] = vocabularyCards([word]);
    expect(card.hint).toBe("_____, I liked it.");
    expect(card.context).toEqual({ text: "Actually, I liked it.", sessionId: "s1" });
  });

  it("has no hint when no sentence contains the English", () => {
    const [card] = vocabularyCards([{ ...word, contexts: [word.contexts[0]] }]);
    expect(card.hint).toBeNull();
    expect(card.context?.text).toBe("No translation used here.");
  });
});

describe("mistakeCards", () => {
  it("groups the same mistake, newest first, counting how often it was made", () => {
    const cards = mistakeCards([
      mistake({ id: "a", createdAt: 1000 }),
      mistake({ id: "b", createdAt: 3000, original: "I  have went ", sentence: "I have went home." }),
      mistake({
        id: "c",
        createdAt: 2000,
        original: "he go",
        correction: "he goes",
        category: "subject_verb_agreement",
      }),
    ]);
    expect(cards.map((c) => [c.original, c.timesMade])).toEqual([
      ["I have went", 2],
      ["he go", 1],
    ]);
    expect(cards[0].sentence).toBe("I have went home.");
    expect(cards[0].fixedSentence).toBe("I have gone home.");
  });

  it("skips corrections that change nothing and keyboard slips", () => {
    expect(
      mistakeCards([
        mistake({ original: "ok", correction: " ok" }),
        mistake({ original: "" }),
        mistake({ original: "teh", correction: "the", category: "spelling", subtype: "keyboard_typo" }),
      ]),
    ).toEqual([]);
  });

  it("fills a missing classification from older copies of the mistake", () => {
    const [card] = mistakeCards([
      mistake({ id: "new", createdAt: 2000, subtype: null, tense: null }),
      mistake({ id: "old", createdAt: 1000 }),
    ]);
    expect(card.subtype).toBe("past_participle");
    expect(card.tense).toBe("present_perfect");
  });
});

describe("filterMistakes", () => {
  const cards = mistakeCards([
    mistake({ id: "a" }),
    mistake({
      id: "b",
      original: "he go",
      correction: "he goes",
      category: "subject_verb_agreement",
      subtype: "third_person_s",
      tense: "present_simple",
    }),
    mistake({
      id: "c",
      original: "a English",
      correction: "an English",
      category: "articles",
      subtype: "a_vs_the",
      tense: null,
    }),
  ]);

  it("filters by tense, category and type", () => {
    const originals = (list: MistakeCard[]) => list.map((c) => c.original);
    expect(originals(filterMistakes(cards, {}))).toHaveLength(3);
    expect(originals(filterMistakes(cards, { tense: "present_simple" }))).toEqual(["he go"]);
    expect(originals(filterMistakes(cards, { category: "articles" }))).toEqual(["a English"]);
    expect(originals(filterMistakes(cards, { category: "verb_form", subtype: "other" }))).toEqual([]);
  });
});

describe("deckCounts and buildQueue", () => {
  const card = (key: string) => ({ ...mistakeCards([mistake({ original: key })])[0] });
  const cards: QueuedCard<MistakeCard>[] = [
    { card: card("new1"), state: null },
    { card: card("due-late"), state: state({ dueAt: NOW - 10 }) },
    { card: card("future"), state: state({ dueAt: NOW + 500 }) },
    { card: card("new2"), state: null },
    { card: card("due-early"), state: state({ dueAt: NOW - 100, repetitions: 0 }) },
  ];

  it("counts new, due and learned cards", () => {
    expect(deckCounts(cards, NOW)).toEqual({ total: 5, new: 2, due: 2, learned: 2, nextDueAt: NOW + 500 });
  });

  it("puts due cards first (most overdue first), then limited new cards", () => {
    expect(buildQueue(cards, NOW).map((c) => c.card.original)).toEqual(["due-early", "due-late", "new1", "new2"]);
    expect(buildQueue(cards, NOW, 1).map((c) => c.card.original)).toEqual(["due-early", "due-late", "new1"]);
    expect(buildQueue(cards, NOW, 5, 1)).toHaveLength(1);
  });
});

describe("checkAnswer", () => {
  it("ignores case, accents, punctuation and spaces", () => {
    expect(checkAnswer("  even SO!", ["Even so", "Actually"])).toBe("exact");
    expect(checkAnswer("I don’t know", ["I don't know"])).toBe("exact");
  });

  it("accepts a small typo as close", () => {
    expect(checkAnswer("actualy", ["Actually"])).toBe("close");
    expect(checkAnswer("take advantaje off", ["take advantage of"])).toBe("close");
  });

  it("says wrong otherwise, and nothing for an empty answer", () => {
    expect(checkAnswer("in fact", ["Actually"])).toBe("wrong");
    expect(checkAnswer("  ", ["Actually"])).toBeNull();
  });
});
