import { describe, expect, it } from "vitest";
import { deployProblems, evalEnabled, parseEnv } from "./env";

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

  it("accepts bracketed IPv6 literals in ALLOWED_HOSTS, and refuses them with a port or unbracketed", () => {
    expect(parseEnv({ ALLOWED_HOSTS: "[2001:DB8::1], companion.example.com" }).ALLOWED_HOSTS).toEqual([
      "[2001:db8::1]",
      "companion.example.com",
    ]);
    for (const value of ["[::1]:3737", "::1", "[nope]", "[]"]) {
      expect(() => parseEnv({ ALLOWED_HOSTS: value }), value).toThrow(/ALLOWED_HOSTS/);
    }
  });

  it("MIGRATE_ON_START defaults to true and takes true/false/1/0", () => {
    expect(parseEnv({}).MIGRATE_ON_START).toBe(true);
    expect(parseEnv({ MIGRATE_ON_START: "false" }).MIGRATE_ON_START).toBe(false);
    expect(parseEnv({ MIGRATE_ON_START: "0" }).MIGRATE_ON_START).toBe(false);
    expect(() => parseEnv({ MIGRATE_ON_START: "no" })).toThrow(/MIGRATE_ON_START/);
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

describe("parseEnv: login", () => {
  it("has nothing required locally, and sign-up closed beyond the first account", () => {
    expect(parseEnv({})).toMatchObject({ SIGNUP_ALLOWED_EMAILS: [] });
    expect(parseEnv({}).BETTER_AUTH_SECRET).toBeUndefined();
  });

  it("splits SIGNUP_ALLOWED_EMAILS, trimming and lowercasing", () => {
    expect(parseEnv({ SIGNUP_ALLOWED_EMAILS: " Ana@X.com, ,bruno@y.com " }).SIGNUP_ALLOWED_EMAILS).toEqual([
      "ana@x.com",
      "bruno@y.com",
    ]);
    expect(() => parseEnv({ SIGNUP_ALLOWED_EMAILS: "ana@x.com,not-an-email" })).toThrow(/SIGNUP_ALLOWED_EMAILS/);
  });

  it("wants a secret of at least 32 characters, and never prints it", () => {
    expect(parseEnv({ BETTER_AUTH_SECRET: "x".repeat(32) }).BETTER_AUTH_SECRET).toHaveLength(32);
    const error = (() => {
      try {
        parseEnv({ BETTER_AUTH_SECRET: "too-short-secret" });
      } catch (e) {
        return String(e);
      }
    })();
    expect(error).toMatch(/BETTER_AUTH_SECRET: expected at least 32 characters/);
    expect(error).not.toContain("too-short-secret");
  });

  it("wants BETTER_AUTH_URL to be an http(s) URL", () => {
    expect(parseEnv({ BETTER_AUTH_URL: "https://companion.example.com" }).BETTER_AUTH_URL).toBeTruthy();
    expect(() => parseEnv({ BETTER_AUTH_URL: "companion.example.com" })).toThrow(/BETTER_AUTH_URL/);
    expect(() => parseEnv({ BETTER_AUTH_URL: "ftp://companion.example.com" })).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("deployProblems", () => {
  it("asks nothing from a local run", () => {
    expect(deployProblems(parseEnv({}))).toEqual([]);
  });

  it("a deploy (ALLOWED_HOSTS set) needs the secret and the public URL", () => {
    const problems = deployProblems(parseEnv({ ALLOWED_HOSTS: "companion.example.com" }));
    expect(problems).toHaveLength(2);
    expect(problems.join()).toMatch(/BETTER_AUTH_SECRET/);
    expect(problems.join()).toMatch(/BETTER_AUTH_URL/);
    const ready = parseEnv({
      ALLOWED_HOSTS: "companion.example.com",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "https://companion.example.com",
    });
    expect(deployProblems(ready)).toEqual([]);
  });
});

describe("evalEnabled", () => {
  it("is on in development, off in production unless ENABLE_EVAL=true", () => {
    expect(evalEnabled(parseEnv({}), "development")).toBe(true);
    expect(evalEnabled(parseEnv({}), "production")).toBe(false);
    expect(evalEnabled(parseEnv({ ENABLE_EVAL: "true" }), "production")).toBe(true);
    expect(evalEnabled(parseEnv({ ENABLE_EVAL: "false" }), "development")).toBe(false);
  });
});
