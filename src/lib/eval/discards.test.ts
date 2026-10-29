import { describe, expect, it } from "vitest";

import { type DiscardedRow, discardsToSamples, groupDiscards, repeatsDiscard } from "./discards";

const row = (partial: Partial<DiscardedRow>): DiscardedRow => ({
  messageId: "m1",
  content: "I am agree with the plan and we go there tomorrow",
  inputMode: "typed",
  original: "go",
  discardReason: null,
  ...partial,
});

describe("discardsToSamples", () => {
  it("makes one sample per message with every discarded fragment as forbidden", () => {
    const samples = discardsToSamples([
      row({}),
      row({ original: "plan" }),
      row({ messageId: "m2", content: "Hi there", original: "Hi" }),
    ]);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({
      text: row({}).content,
      expect: [],
      forbidden: ["go", "plan"],
      inputMode: "typed",
    });
    expect(samples[1].forbidden).toEqual(["Hi"]);
  });

  it("lists a repeated fragment once, ignoring case", () => {
    expect(discardsToSamples([row({}), row({ original: "GO" })])[0].forbidden).toEqual(["go"]);
  });

  it("keeps the reasons the learner gave and skips empty ones", () => {
    const [s] = discardsToSamples([
      row({ discardReason: "it is fine" }),
      row({ original: "plan", discardReason: "  " }),
    ]);
    expect(s.reasons).toEqual(["go: it is fine"]);
  });

  it("drops fragments missing from the message and empty rows", () => {
    expect(discardsToSamples([row({ original: "nowhere" }), row({ original: "  " }), row({ content: " " })])).toEqual(
      [],
    );
  });

  it("keeps the input mode of the message", () => {
    expect(discardsToSamples([row({ inputMode: "spoken" })])[0].inputMode).toBe("spoken");
  });
});

describe("groupDiscards", () => {
  it("counts the rows it left out and keeps the chat context", () => {
    const context = { mode: "conversation" as const, history: [{ learner: null, assistant: "Hi!" }] };
    const { samples, dropped } = groupDiscards([row({ context }), row({ original: "nowhere" })]);
    expect(dropped).toBe(1);
    expect(samples[0].context).toEqual(context);
  });
});

describe("repeatsDiscard", () => {
  it("does not match letters inside other words", () => {
    expect(repeatsDiscard("going", "go")).toBe(false);
    expect(repeatsDiscard("thinking", "in")).toBe(false);
  });

  it("matches a re-report that shares a content word, even if neither contains the other", () => {
    expect(repeatsDiscard("we go", "go there")).toBe(true);
    expect(repeatsDiscard("Go", "go")).toBe(true);
  });

  it("ignores shared function words", () => {
    expect(repeatsDiscard("the meeting", "the plan")).toBe(false);
  });

  it("compares phrases when the discarded fragment is only function words", () => {
    expect(repeatsDiscard("is a", "a")).toBe(true);
    expect(repeatsDiscard("going", "a")).toBe(false);
  });

  it("ignores punctuation and case, and empty fragments", () => {
    expect(repeatsDiscard("Depend of,", "depend of")).toBe(true);
    expect(repeatsDiscard("", "go")).toBe(false);
  });
});
