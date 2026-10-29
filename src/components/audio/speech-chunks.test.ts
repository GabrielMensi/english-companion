import { describe, expect, it } from "vitest";

import { speechChunks, splitFirstClause } from "./speech-chunks";

describe("splitFirstClause", () => {
  it("keeps short sentences whole", () => {
    expect(splitFirstClause("Good morning!")).toEqual(["Good morning!"]);
    expect(splitFirstClause("I think your sentence is almost perfect now.")).toEqual([
      "I think your sentence is almost perfect now.",
    ]);
  });

  it("cuts at the last comma within the limit", () => {
    expect(
      splitFirstClause("Well, I think your sentence is almost perfect, but you should use the present perfect here."),
    ).toEqual(["Well, I think your sentence is almost perfect,", "but you should use the present perfect here."]);
  });

  it("cuts before a conjunction when there's no punctuation", () => {
    expect(splitFirstClause("Your sentence is correct and the word order is natural for a native speaker.")).toEqual([
      "Your sentence is correct",
      "and the word order is natural for a native speaker.",
    ]);
  });

  it("prefers punctuation over a later conjunction", () => {
    expect(splitFirstClause("Yes, that works and it sounds really natural to most native speakers.")).toEqual([
      "Yes, that works",
      "and it sounds really natural to most native speakers.",
    ]);
  });

  it("never leaves a part shorter than minWords", () => {
    expect(splitFirstClause("Yes, the present perfect continuous is the right tense for this sentence here.")).toEqual([
      "Yes, the present perfect continuous is the right tense for this sentence here.",
    ]);
  });

  it("keeps long sentences whole when there's no boundary early on", () => {
    const sentence = "The present perfect continuous describes actions that started in the past and continue now.";
    expect(splitFirstClause(sentence, { maxWords: 5 })).toEqual([sentence]);
  });

  it("respects maxWords", () => {
    expect(splitFirstClause("One two three four, five six seven eight nine ten eleven.", { maxWords: 3 })).toEqual([
      "One two three four, five six seven eight nine ten eleven.",
    ]);
  });
});

describe("speechChunks", () => {
  it("starts short and lets each chunk grow, cutting long sentences at clauses", () => {
    expect(
      speechChunks([
        "Good job, your answer is clear and it uses the right tense for the situation you describe.",
        "Next time, try adding a time expression, like for three years or since last summer, so the listener knows how long it has been going on.",
      ]),
    ).toEqual([
      // Budget 8.
      "Good job, your answer is clear",
      // Budget 16: the rest of the sentence fits.
      "and it uses the right tense for the situation you describe.",
      // Budget 32: whole.
      "Next time, try adding a time expression, like for three years or since last summer, so the listener knows how long it has been going on.",
    ]);
  });

  it("cuts a long second sentence when the budget is still small", () => {
    expect(
      speechChunks([
        "Good morning!",
        "I think your sentence is almost perfect, but you should say I have been living here for three years instead.",
      ]),
    ).toEqual([
      "Good morning!",
      "I think your sentence is almost perfect,",
      "but you should say I have been living here for three years instead.",
    ]);
  });

  it("keeps short sentences whole", () => {
    expect(speechChunks(["Hello there.", "How are you?"])).toEqual(["Hello there.", "How are you?"]);
  });

  it("drops empty sentences", () => {
    expect(speechChunks(["", "  Hello there.  ", ""])).toEqual(["Hello there."]);
    expect(speechChunks([])).toEqual([]);
  });
});
