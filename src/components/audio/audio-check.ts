/**
 * Checks that synthesized audio looks like speech, not noise (pure, so it can be tested).
 *
 * Kokoro on WebGPU can produce garbage on some GPUs/drivers (ONNX Runtime Web numerical bugs,
 * reported on AMD, Intel and Android GPUs), while the same model on WASM is fine. Running isn't
 * enough proof that a device works, so its output is checked: speech has pauses and syllables
 * (loudness that rises and falls) and a harmonic spectrum (low spectral flatness, few zero
 * crossings in the loud parts); noise is steady, flat and crosses zero all the time.
 */

export interface AudioMetrics {
  /** Samples that are NaN or ±Infinity. */
  nonFinite: number;
  /** Largest absolute sample value. */
  peak: number;
  /** Share of samples at or beyond full scale (|x| ≥ 0.99). */
  clipped: number;
  /** Root mean square of the whole buffer. */
  rms: number;
  /** Median zero-crossing rate (crossings per sample) of the loud frames. */
  zeroCrossingRate: number;
  /** Median spectral flatness (0 = pure tone, ~0.56 = white noise) of the loud frames. */
  flatness: number;
  /** Loudness range between the loud and the quiet frames, in dB (95th vs 10th percentile). */
  dynamicRangeDb: number;
}

export type AudioCheck =
  | { ok: true; metrics: AudioMetrics }
  /**
   * `kind`: "invalid" for NaN/Infinity or clipping, "silent" for (near) silence, "noise" for
   * a signal that isn't speech-like.
   */
  | { ok: false; kind: "invalid" | "silent" | "noise"; reason: string; metrics: AudioMetrics };

const FRAME = 512;

/**
 * Thresholds, with a wide margin: on Kokoro's real output (3 voices, 6 sentences from "Yes." to 20
 * words, WASM q8) the loud frames had flatness ≤ 0.01, zero-crossing rate ≤ 0.11 and a range of
 * 60+ dB, while white noise is ~0.56 / ~0.5 / ~0 dB.
 */
const MAX_CLIPPED = 0.01;
const MIN_RMS = 1e-3;
const MAX_ZCR = 0.25;
const MAX_FLATNESS = 0.2;
const MIN_DYNAMIC_RANGE_DB = 20;

/**
 * Says whether `samples` (mono, -1..1) look like speech. `reason` explains a rejection in a few
 * words, for logs and Settings. Buffers too short to judge (under ~0.17 s) only get the
 * NaN/clipping/silence checks.
 */
export function checkSpeechAudio(samples: Float32Array): AudioCheck {
  const metrics = audioMetrics(samples);
  const fail = (kind: "invalid" | "silent" | "noise", reason: string): AudioCheck => ({ ok: false, kind, reason, metrics });
  if (metrics.nonFinite > 0) return fail("invalid", `${metrics.nonFinite} NaN/Infinity samples`);
  if (metrics.clipped > MAX_CLIPPED) return fail("invalid", `${pct(metrics.clipped)} of the samples clip`);
  if (metrics.rms < MIN_RMS) return fail("silent", "silent");
  // Too short to judge its shape (Kokoro never makes audio this short): what was checked is enough.
  if (samples.length < FRAME * 8) return { ok: true, metrics };
  if (metrics.flatness > MAX_FLATNESS)
    return fail("noise", `noise-like spectrum (flatness ${metrics.flatness.toFixed(2)})`);
  if (metrics.zeroCrossingRate > MAX_ZCR)
    return fail("noise", `noise-like signal (zero-crossing rate ${metrics.zeroCrossingRate.toFixed(2)})`);
  if (metrics.dynamicRangeDb < MIN_DYNAMIC_RANGE_DB)
    return fail("noise", `steady sound with no pauses (range ${metrics.dynamicRangeDb.toFixed(0)} dB)`);
  return { ok: true, metrics };
}

function pct(x: number) {
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}

export function audioMetrics(samples: Float32Array): AudioMetrics {
  let nonFinite = 0;
  let peak = 0;
  let clipped = 0;
  let sumSquares = 0;
  for (const x of samples) {
    if (!Number.isFinite(x)) {
      nonFinite++;
      continue;
    }
    const a = Math.abs(x);
    if (a > peak) peak = a;
    if (a >= 0.99) clipped++;
    sumSquares += x * x;
  }
  const n = samples.length;
  const rms = n > 0 ? Math.sqrt(sumSquares / n) : 0;

  // Per-frame loudness, zero crossings and spectral flatness (non-finite samples count as 0).
  const frames: { rms: number; zcr: number; start: number }[] = [];
  for (let start = 0; start + FRAME <= n; start += FRAME) {
    let energy = 0;
    let crossings = 0;
    let prev = finite(samples[start]);
    for (let i = start; i < start + FRAME; i++) {
      const x = finite(samples[i]);
      energy += x * x;
      if (i > start && (x >= 0) !== (prev >= 0)) crossings++;
      prev = x;
    }
    frames.push({ rms: Math.sqrt(energy / FRAME), zcr: crossings / (FRAME - 1), start });
  }
  if (frames.length === 0) {
    return { nonFinite, peak, clipped: n ? clipped / n : 0, rms, zeroCrossingRate: 0, flatness: 0, dynamicRangeDb: 0 };
  }

  const levels = frames.map((f) => f.rms).sort((a, b) => a - b);
  const loudest = levels[levels.length - 1];
  // "Loud" frames: within 20 dB of the loudest one (vowels and voiced consonants in speech).
  const loud = frames.filter((f) => f.rms > 0 && f.rms >= loudest * 0.1);
  const window = hann(FRAME);
  const flatness = median(loud.map((f) => spectralFlatness(samples, f.start, window)));
  const zeroCrossingRate = median(loud.map((f) => f.zcr));
  const floor = 1e-5;
  const dynamicRangeDb =
    20 * Math.log10(Math.max(quantile(levels, 0.95), floor) / Math.max(quantile(levels, 0.1), floor));

  return { nonFinite, peak, clipped: clipped / n, rms, zeroCrossingRate, flatness, dynamicRangeDb };
}

function finite(x: number) {
  return Number.isFinite(x) ? x : 0;
}

function median(values: number[]) {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

/** `sorted` must be ascending. */
function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function hann(size: number) {
  return Float32Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
}

/** Geometric mean / arithmetic mean of the power spectrum (skipping DC). */
function spectralFlatness(samples: Float32Array, start: number, window: Float32Array) {
  const size = window.length;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = finite(samples[start + i]) * window[i];
  fft(re, im);
  let logSum = 0;
  let sum = 0;
  const bins = size / 2;
  for (let k = 1; k <= bins; k++) {
    const power = re[k] * re[k] + im[k] * im[k] + 1e-12;
    logSum += Math.log(power);
    sum += power;
  }
  return Math.exp(logSum / bins) / (sum / bins);
}

/** In-place iterative radix-2 FFT; the length must be a power of two. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}
