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
