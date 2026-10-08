import { describe, expect, it } from "vitest";
import {
  cleanTopic,
  resolveTopic,
  TOPIC_MAX_LENGTH,
  TOPIC_PRESETS,
  topicOpening,
  topicRule,
  topicTitle,
} from "./topics";

describe("TOPIC_PRESETS", () => {
  it("have unique ids and at least one opening", () => {
    expect(new Set(TOPIC_PRESETS.map((p) => p.id)).size).toBe(TOPIC_PRESETS.length);
    for (const preset of TOPIC_PRESETS) expect(preset.openings.length).toBeGreaterThan(0);
  });
});

describe("cleanTopic", () => {
  it("keeps one trimmed line without double quotes or a final period", () => {
    expect(cleanTopic('  my "dream"\n job  interview. ')).toBe("my 'dream' job interview");
  });

  it("caps the length", () => {
    expect(cleanTopic("a".repeat(300))).toHaveLength(TOPIC_MAX_LENGTH);
  });

  it("drops final punctuation after a space", () => {
    expect(cleanTopic("football .")).toBe("football");
  });

  it("never ends a cut topic in punctuation or a space", () => {
    const cut = cleanTopic(`${"a".repeat(TOPIC_MAX_LENGTH - 2)}, b`);
    expect(cut).toBe("a".repeat(TOPIC_MAX_LENGTH - 2));
  });
});

describe("resolveTopic", () => {
  it("uses the preset label as the topic", () => {
    expect(resolveTopic({ preset: "swe-interview", topic: "ignored" })).toEqual({
      preset: "swe-interview",
      topic: "Software engineer interview",
    });
  });

  it("falls back to the custom topic when the preset is unknown", () => {
    expect(resolveTopic({ preset: "nope", topic: " Football " })).toEqual({ preset: null, topic: "Football" });
  });

  it("returns null without a topic", () => {
    expect(resolveTopic({ preset: null, topic: "  " })).toBeNull();
    expect(resolveTopic({})).toBeNull();
  });
});

describe("topicRule", () => {
  it("is the preset's rule", () => {
    expect(topicRule({ preset: "standup", topic: "Daily stand-up" })).toBe(TOPIC_PRESETS[3].rule);
  });

  it("quotes a custom topic", () => {
    const rule = topicRule({ preset: null, topic: 'cooking "asado"' });
    expect(rule).toContain(`"cooking 'asado'"`);
  });
});

describe("topicOpening and topicTitle", () => {
  it("pick one of the preset's openings", () => {
    const preset = TOPIC_PRESETS[0];
    expect(topicOpening({ preset: preset.id, topic: preset.label }, () => 0.99)).toBe(preset.openings.at(-1));
    expect(topicTitle({ preset: preset.id, topic: preset.label })).toBe(preset.label);
  });

  it("use the custom topic", () => {
    expect(topicOpening({ preset: null, topic: "Football" })).toMatch(/^Let’s talk about Football\./);
    expect(topicTitle({ preset: null, topic: "Football" })).toBe("Football");
  });
});
