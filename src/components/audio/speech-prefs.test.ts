import { describe, expect, it } from "vitest";
import { DEFAULT_SPEECH_PREFS, parseSpeechPrefs } from "./speech-prefs";

describe("parseSpeechPrefs", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(parseSpeechPrefs(null)).toEqual(DEFAULT_SPEECH_PREFS);
  });

  it("keeps preferences saved before Kokoro existed and defaults the engine to the browser", () => {
    expect(parseSpeechPrefs(JSON.stringify({ voice: "Microsoft Aria", rate: 0.9 }))).toEqual({
      engine: "browser",
      voice: "Microsoft Aria",
      kokoroVoice: "af_heart",
      rate: 0.9,
    });
  });

  it("reads the Kokoro engine and voice", () => {
    const prefs = parseSpeechPrefs(JSON.stringify({ engine: "kokoro", kokoroVoice: "bf_emma", voice: null, rate: 1 }));
    expect(prefs.engine).toBe("kokoro");
    expect(prefs.kokoroVoice).toBe("bf_emma");
  });

  it("replaces invalid values with the defaults", () => {
    expect(parseSpeechPrefs(JSON.stringify({ engine: "gemini", kokoroVoice: "zz_nobody", rate: 9 }))).toEqual(
      DEFAULT_SPEECH_PREFS,
    );
    expect(parseSpeechPrefs("{not json")).toEqual(DEFAULT_SPEECH_PREFS);
    expect(parseSpeechPrefs("[]")).toEqual(DEFAULT_SPEECH_PREFS);
  });
});
