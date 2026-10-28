import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("starts with nothing set: paths get their defaults and API keys stay unset", () => {
    const env = parseEnv({});
    expect(env.DATABASE_PATH).toBe("data/companion.db");
    expect(env.ASR_SAMPLES_DIR).toBe("data/asr-samples");
    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBeUndefined();
    expect(env.GROQ_API_KEY).toBeUndefined();
  });

  it("treats empty or blank values as unset", () => {
    const env = parseEnv({ GROQ_API_KEY: "", DATABASE_PATH: "  " });
    expect(env.GROQ_API_KEY).toBeUndefined();
    expect(env.DATABASE_PATH).toBe("data/companion.db");
  });

  it("trims the values it keeps", () => {
    const env = parseEnv({ DATABASE_PATH: " data/dev.db ", GOOGLE_GENERATIVE_AI_API_KEY: "key-123\n" });
    expect(env.DATABASE_PATH).toBe("data/dev.db");
    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBe("key-123");
  });

  it("ignores variables it doesn't know", () => {
    expect(parseEnv({ PATH: "/usr/bin", NODE_ENV: "test" })).not.toHaveProperty("PATH");
  });
});

describe("parseEnv: hosts and proxy", () => {
  it("defaults to no extra hosts and no trusted proxy", () => {
    expect(parseEnv({})).toMatchObject({ ALLOWED_HOSTS: [], TRUST_PROXY: false });
  });

  it("splits ALLOWED_HOSTS on commas, trimming and lowercasing", () => {
    expect(parseEnv({ ALLOWED_HOSTS: " Companion.example.com, ,www.example.com " }).ALLOWED_HOSTS).toEqual([
      "companion.example.com",
      "www.example.com",
    ]);
  });

  it("accepts only true/false/1/0 for TRUST_PROXY", () => {
    expect(parseEnv({ TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(parseEnv({ TRUST_PROXY: "1" }).TRUST_PROXY).toBe(true);
    expect(parseEnv({ TRUST_PROXY: "0" }).TRUST_PROXY).toBe(false);
    expect(parseEnv({ TRUST_PROXY: "" }).TRUST_PROXY).toBe(false);
    expect(() => parseEnv({ TRUST_PROXY: "maybe" })).toThrow(/TRUST_PROXY: expected "true", "false", "1" or "0"/);
  });

  it("accepts only true/false/1/0 for CSP_REPORT_ONLY, off by default", () => {
    expect(parseEnv({}).CSP_REPORT_ONLY).toBe(false);
    expect(parseEnv({ CSP_REPORT_ONLY: "true" }).CSP_REPORT_ONLY).toBe(true);
    expect(() => parseEnv({ CSP_REPORT_ONLY: "maybe" })).toThrow(/CSP_REPORT_ONLY/);
  });

  it("refuses hosts with a scheme, port or path", () => {
    for (const value of ["https://companion.example.com", "companion.example.com:443", "example.com/app", "a b"]) {
      expect(() => parseEnv({ ALLOWED_HOSTS: value }), value).toThrow(/ALLOWED_HOSTS: expected comma-separated/);
    }
  });

  it("lists every invalid variable, never its value", () => {
    let message = "";
    try {
      parseEnv({ TRUST_PROXY: "yes-secret", ALLOWED_HOSTS: "http://x" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("TRUST_PROXY");
    expect(message).toContain("ALLOWED_HOSTS");
    expect(message).not.toContain("yes-secret");
  });
});
