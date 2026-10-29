import { describe, expect, it } from "vitest";

import { encodeWav, resample, toMono } from "./wav";

describe("encodeWav", () => {
  it("writes a 16-bit mono PCM header and clamps the samples", () => {
    const buffer = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
    const view = new DataView(buffer);
    const text = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));

    expect(buffer.byteLength).toBe(44 + 8);
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });
});

describe("resample", () => {
  it("keeps the duration and interpolates", () => {
    const out = resample(new Float32Array([0, 1, 0, 1, 0, 1]), 48_000, 16_000);
    expect(out).toHaveLength(2);
    expect(resample(new Float32Array([0, 1]), 8_000, 16_000)).toEqual(new Float32Array([0, 0.5, 1, 1]));
  });
});

describe("toMono", () => {
  it("averages the channels", () => {
    expect(toMono([new Float32Array([1, 0]), new Float32Array([0, 0])])).toEqual(new Float32Array([0.5, 0]));
  });
});
