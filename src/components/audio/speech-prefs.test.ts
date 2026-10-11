import { describe, expect, it } from "vitest";
import { DEFAULT_SPEECH_PREFS, parseGpuRejection, parseSpeechPrefs } from "./speech-prefs";

describe("parseSpeechPrefs", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(parseSpeechPrefs(null)).toEqual(DEFAULT_SPEECH_PREFS);
  });

  it("keeps preferences saved before Kokoro existed and defaults the engine to the browser", () => {
    expect(parseSpeechPrefs(JSON.stringify({ voice: "Microsoft Aria", rate: 0.9 }))).toEqual({
      engine: "browser",
      voice: "Microsoft Aria",
      kokoroVoice: "af_heart",
      kokoroDevice: "auto",
      rate: 0.9,
    });
  });

  it("reads the Kokoro engine and voice", () => {
    const prefs = parseSpeechPrefs(JSON.stringify({ engine: "kokoro", kokoroVoice: "bf_emma", voice: null, rate: 1 }));
    expect(prefs.engine).toBe("kokoro");
    expect(prefs.kokoroVoice).toBe("bf_emma");
    expect(prefs.kokoroDevice).toBe("auto");
  });

  it("reads the Kokoro device", () => {
    expect(parseSpeechPrefs(JSON.stringify({ kokoroDevice: "wasm" })).kokoroDevice).toBe("wasm");
    expect(parseSpeechPrefs(JSON.stringify({ kokoroDevice: "webgpu" })).kokoroDevice).toBe("webgpu");
    expect(parseSpeechPrefs(JSON.stringify({ kokoroDevice: "cuda" })).kokoroDevice).toBe("auto");
  });

  it("replaces invalid values with the defaults", () => {
    expect(
      parseSpeechPrefs(JSON.stringify({ engine: "gemini", kokoroVoice: "zz_nobody", kokoroDevice: 1, rate: 9 })),
    ).toEqual(DEFAULT_SPEECH_PREFS);
    expect(parseSpeechPrefs("{not json")).toEqual(DEFAULT_SPEECH_PREFS);
    expect(parseSpeechPrefs("[]")).toEqual(DEFAULT_SPEECH_PREFS);
  });
});

describe("parseGpuRejection", () => {
  it("reads a stored rejection", () => {
    const stored = { reason: "noise-like spectrum (flatness 0.56)", at: "2026-10-02T20:00:00.000Z" };
    expect(parseGpuRejection(JSON.stringify(stored))).toEqual(stored);
  });

  it("ignores missing or invalid values", () => {
    expect(parseGpuRejection(null)).toBeNull();
    expect(parseGpuRejection("{oops")).toBeNull();
    expect(parseGpuRejection(JSON.stringify({ reason: 3 }))).toBeNull();
  });
});
