import { describe, expect, it } from "vitest";
import { type DiscardedRow, discardsToSamples } from "./discards";

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
