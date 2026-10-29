import { describe, expect, it } from "vitest";

import { audioBytes, ByteLru, cacheKey, keysToEvict, usableFor } from "./audio-cache-core";

describe("cacheKey", () => {
  it("depends on text, voice and speed", () => {
    expect(cacheKey(" Hello. ", "af_heart", 1)).toBe(cacheKey("Hello.", "af_heart", 1));
    expect(cacheKey("Hello.", "af_heart", 1)).not.toBe(cacheKey("Hello.", "bf_emma", 1));
    expect(cacheKey("Hello.", "af_heart", 1)).not.toBe(cacheKey("Hello.", "af_heart", 1.25));
  });
});

describe("usableFor", () => {
  it("only plays audio from the running device", () => {
    expect(usableFor({ device: "wasm" }, "auto", "wasm")).toBe(true);
    expect(usableFor({ device: "webgpu" }, "auto", "wasm")).toBe(false);
  });

  it("before the model loads, follows the device setting", () => {
    expect(usableFor({ device: "webgpu" }, "auto", null)).toBe(true);
    expect(usableFor({ device: "wasm" }, "wasm", null)).toBe(true);
    expect(usableFor({ device: "webgpu" }, "wasm", null)).toBe(false);
  });
});

describe("ByteLru", () => {
  const lru = () => new ByteLru<Float32Array>(10 * 4, (v) => v.byteLength);

  it("evicts the least recently used entries past the byte cap", () => {
    const cache = lru();
    cache.set("a", new Float32Array(4));
    cache.set("b", new Float32Array(4));
    cache.get("a"); // "b" is now the oldest.
    cache.set("c", new Float32Array(4));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.bytes).toBe(32);
  });

  it("replaces an entry and skips values bigger than the cap", () => {
    const cache = lru();
    cache.set("a", new Float32Array(4));
    cache.set("a", new Float32Array(2));
    expect(cache.bytes).toBe(8);
    cache.set("huge", new Float32Array(11));
    expect(cache.get("huge")).toBeUndefined();
    expect(cache.size).toBe(1);
  });
});

describe("keysToEvict", () => {
  it("removes the oldest entries until the rest fit", () => {
    const entries = [
      { key: "new", bytes: 50, lastUsed: 3 },
      { key: "old", bytes: 50, lastUsed: 1 },
      { key: "mid", bytes: 50, lastUsed: 2 },
    ];
    expect(keysToEvict(entries, 100)).toEqual(["old"]);
    expect(keysToEvict(entries, 60)).toEqual(["old", "mid"]);
    expect(keysToEvict(entries, 1000)).toEqual([]);
  });
});

describe("audioBytes", () => {
  it("adds up every chunk", () => {
    expect(audioBytes({ chunks: [new Float32Array(3), new Float32Array(5)] })).toBe(32);
  });
});
