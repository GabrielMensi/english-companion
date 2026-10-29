import { describe, expect, it } from "vitest";

import { maskKey, pickApiKey } from "./credentials";

describe("maskKey", () => {
  it("only shows the last characters", () => {
    expect(maskKey("AIzaSyA1234567890abcd")).toBe("••••abcd");
    expect(maskKey("short")).toBe("••••rt");
  });
});

describe("pickApiKey", () => {
  it("prefers the key saved in the app over the environment", () => {
    expect(pickApiKey("app-key", "env-key")).toEqual({ key: "app-key", source: "app" });
  });

  it("falls back to the environment, ignoring blank values", () => {
    expect(pickApiKey("  ", " env-key ")).toEqual({ key: "env-key", source: "env" });
    expect(pickApiKey(undefined, "")).toBeNull();
  });
});
