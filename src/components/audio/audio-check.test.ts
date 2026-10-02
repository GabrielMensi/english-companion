import { describe, expect, it } from "vitest";
import { audioMetrics, checkSpeechAudio } from "./audio-check";

const RATE = 24000;

/** Deterministic pseudo-random numbers in [-1, 1). */
function noiseSource(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

/**
 * Something shaped like speech: voiced "syllables" (a gliding pitch with decaying harmonics)
 * separated by pauses, with a quiet fricative-like hiss before some of them, and silence at the edges.
 */
function speechLike(seconds = 2.5) {
  const noise = noiseSource(7);
  const out = new Float32Array(Math.round(seconds * RATE));
  const syllable = 0.22 * RATE;
  const gap = 0.08 * RATE;
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    if (t < 0.15 || t > seconds - 0.15) continue; // Silence at the start and the end.
    const pos = (i - 0.15 * RATE) % (syllable + gap);
    const n = Math.floor((i - 0.15 * RATE) / (syllable + gap));
    if (pos >= syllable) {
      // Pause, with a short, quiet hiss before every other syllable.
      if (n % 2 === 0 && pos > syllable + gap / 2) out[i] = noise() * 0.01;
      continue;
    }
    const envelope = Math.sin((Math.PI * pos) / syllable) ** 2;
    const pitch = 140 + 40 * Math.sin(2 * Math.PI * 1.3 * t);
    phase += (2 * Math.PI * pitch) / RATE;
    let x = 0;
    for (let h = 1; h <= 20; h++) x += Math.sin(h * phase) / h ** 1.2;
    out[i] = 0.25 * envelope * x;
  }
  return out;
}

function whiteNoise(seconds = 2.5, amplitude = 0.3) {
  const noise = noiseSource(3);
  return Float32Array.from({ length: Math.round(seconds * RATE) }, () => noise() * amplitude);
}

describe("checkSpeechAudio", () => {
  it("accepts speech-like audio", () => {
    const result = checkSpeechAudio(speechLike());
    expect(result).toMatchObject({ ok: true });
    expect(result.metrics.flatness).toBeLessThan(0.1);
    expect(result.metrics.zeroCrossingRate).toBeLessThan(0.1);
    expect(result.metrics.dynamicRangeDb).toBeGreaterThan(40);
  });

  it("rejects white noise", () => {
    const result = checkSpeechAudio(whiteNoise());
    expect(result.ok).toBe(false);
    expect(result.metrics.flatness).toBeGreaterThan(0.45);
    expect(result.metrics.zeroCrossingRate).toBeGreaterThan(0.4);
  });

  it("rejects noise even when it comes in bursts like syllables", () => {
    const noise = whiteNoise();
    const gated = noise.map((x, i) => (Math.sin((i / RATE) * Math.PI * 4) > 0 ? x : x * 0.001));
    expect(checkSpeechAudio(gated)).toMatchObject({ ok: false, kind: "noise", reason: expect.stringContaining("noise") });
  });

  it("rejects speech buried in noise", () => {
    const noise = noiseSource(11);
    const noisy = speechLike().map((x) => x + noise() * 0.1);
    expect(checkSpeechAudio(noisy).ok).toBe(false);
  });

  it("rejects a steady tone or hum with no pauses", () => {
    const hum = Float32Array.from({ length: 2.5 * RATE }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 120 * i) / RATE));
    expect(checkSpeechAudio(hum)).toMatchObject({ ok: false, reason: expect.stringContaining("steady") });
  });

  it("rejects NaN and Infinity", () => {
    const audio = speechLike();
    audio[1000] = NaN;
    audio[2000] = Infinity;
    expect(checkSpeechAudio(audio)).toMatchObject({ ok: false, kind: "invalid", reason: "2 NaN/Infinity samples" });
  });

  it("rejects heavy clipping", () => {
    const loud = speechLike().map((x) => Math.max(-1, Math.min(1, x * 20)));
    expect(checkSpeechAudio(loud)).toMatchObject({ ok: false, reason: expect.stringContaining("clip") });
  });

  it("rejects silence", () => {
    expect(checkSpeechAudio(new Float32Array(RATE))).toMatchObject({ ok: false, kind: "silent" });
  });

  it("only checks for invalid values in buffers too short to judge", () => {
    expect(checkSpeechAudio(whiteNoise().subarray(0, 2000)).ok).toBe(true);
    expect(checkSpeechAudio(Float32Array.from([0.1, NaN, 0.2]))).toMatchObject({ ok: false, kind: "invalid" });
  });
});

describe("audioMetrics", () => {
  it("measures peak, clipping and rms", () => {
    const m = audioMetrics(Float32Array.from([0.5, -1, 0.5, -0.5]));
    expect(m.peak).toBe(1);
    expect(m.clipped).toBe(0.25);
    expect(m.rms).toBeCloseTo(Math.sqrt((0.25 * 3 + 1) / 4));
  });
});
