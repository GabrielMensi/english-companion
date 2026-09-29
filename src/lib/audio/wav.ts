/**
 * Converts recorded audio to 16 kHz mono 16-bit WAV: the format whisper.cpp
 * requires and every other speech-to-text engine accepts. Pure, so it can be
 * tested; the browser part (decoding the recording) lives in the recorder.
 */
export const SPEECH_SAMPLE_RATE = 16_000;

/** Averages the channels into one. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const mono = new Float32Array(channels[0].length);
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
  }
  return mono;
}

/** Linear-interpolation resampling; enough for speech recognition. */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  const length = Math.round((samples.length * toRate) / fromRate);
  const out = new Float32Array(length);
  const ratio = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const t = position - left;
    out[i] = samples[left] * (1 - t) + samples[right] * t;
  }
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
