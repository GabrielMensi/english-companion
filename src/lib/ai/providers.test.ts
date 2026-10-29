import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings-core";
import { resolveModel } from "./providers";

afterEach(() => vi.unstubAllEnvs());

describe("resolveModel with AI_FAKE", () => {
  it("returns the fake model in development", () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveModel(DEFAULT_SETTINGS, "gemini").call({ temperature: 0 }).model).toMatchObject({ provider: "fake" });
  });

  it("refuses in production without E2E_TEST_SERVER", () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveModel(DEFAULT_SETTINGS, "gemini")).toThrow(/E2E_TEST_SERVER/);
  });

  it("refuses in a deploy even with E2E_TEST_SERVER", () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("E2E_TEST_SERVER", "1");
    vi.stubEnv("ALLOWED_HOSTS", "app.example.com");
    expect(() => resolveModel(DEFAULT_SETTINGS, "gemini")).toThrow(/ALLOWED_HOSTS/);
  });

  it("uses the real provider when AI_FAKE is off", () => {
    expect(resolveModel(DEFAULT_SETTINGS, "gemini").call({ temperature: 0 }).model).not.toMatchObject({
      provider: "fake",
    });
  });
});
