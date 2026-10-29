import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, needsRewrite, upgradeSettings } from "./settings-core";

/** A row saved before v3, shaped like the real ones: Ollama still in the models and the chain. */
const v2Row = {
  provider: "gemini",
  models: { ollama: "gemma4:12b", gemini: "gemini-flash-lite-latest", groq: "qwen/qwen3.8-27b" },
  explanationLanguage: "en",
  countTyposInStats: true,
  fallbacks: ["ollama", "gemini", "groq"],
  ollamaBaseUrl: null,
};

describe("upgradeSettings", () => {
  it("upgrades an old row, keeping every setting that still exists", () => {
    expect(upgradeSettings(v2Row)).toEqual({
      provider: "gemini",
      models: { gemini: "gemini-flash-lite-latest", groq: "qwen/qwen3.8-27b" },
      explanationLanguage: "en",
      countTyposInStats: true,
      fallbacks: ["groq"],
      newCardsPerSession: DEFAULT_SETTINGS.newCardsPerSession,
      version: 3,
    });
  });

  it("upgrades the oldest rows (Ollama primary, no fallbacks key, no version)", () => {
    const oldest = {
      provider: "ollama",
      models: { ollama: "gemma4:12b", gemini: "gemini-flash-latest", groq: "openai/gpt-oss-120b" },
      ollamaBaseUrl: "http://localhost:11434",
      explanationLanguage: "es",
      countTyposInStats: true,
      newCardsPerSession: 7,
    };
    expect(upgradeSettings(oldest)).toEqual({
      provider: "gemini",
      models: { gemini: "gemini-flash-latest", groq: "openai/gpt-oss-120b" },
      explanationLanguage: "es",
      countTyposInStats: true,
      fallbacks: ["groq"],
      newCardsPerSession: 7,
      version: 3,
    });
  });

  it("keeps an empty chain saved by v1 (fallbacks: [], no version)", () => {
    const v1 = {
      provider: "groq",
      models: { gemini: "gemini-flash-latest", groq: "qwen/qwen3.8-27b" },
      explanationLanguage: "en",
      countTyposInStats: true,
      fallbacks: [],
      newCardsPerSession: 0,
    };
    expect(upgradeSettings(v1)).toEqual({ ...v1, version: 3 });
  });

  it("keeps the cards per session and the chain of a current row", () => {
    const row = { ...DEFAULT_SETTINGS, provider: "groq", fallbacks: [], newCardsPerSession: 3 };
    expect(upgradeSettings(row)).toEqual(row);
  });

  it("gives the default fallbacks to a row without the fallbacks key", () => {
    const row: Record<string, unknown> = { ...DEFAULT_SETTINGS, newCardsPerSession: 4 };
    delete row.fallbacks;
    expect(upgradeSettings(row)).toEqual({ ...DEFAULT_SETTINGS, newCardsPerSession: 4, fallbacks: ["groq"] });
    expect(upgradeSettings({ explanationLanguage: "en" })).toEqual({ ...DEFAULT_SETTINGS, explanationLanguage: "en" });
  });

  it("returns null for a row it can't read, so it isn't overwritten", () => {
    expect(upgradeSettings(null)).toBeNull();
    expect(upgradeSettings("oops")).toBeNull();
    expect(upgradeSettings({ ...DEFAULT_SETTINGS, explanationLanguage: "fr" })).toBeNull();
  });
});

describe("needsRewrite", () => {
  it("rewrites an old row once, then never again", () => {
    const upgraded = upgradeSettings(v2Row)!;
    expect(needsRewrite(v2Row, upgraded)).toBe(true);
    // What the row holds after the rewrite (a JSON round trip, as SQLite stores it).
    const stored: unknown = JSON.parse(JSON.stringify(upgraded));
    const again = upgradeSettings(stored)!;
    expect(again).toEqual(upgraded);
    expect(needsRewrite(stored, again)).toBe(false);
  });

  it("ignores key order", () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).reverse());
    expect(needsRewrite(reordered, upgradeSettings(reordered)!)).toBe(false);
  });
});
