// The saved API keys: encrypted at rest, per user, and never mixed up between accounts.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema } from "@/test/db";
import { getEncryptionKeys } from "@/lib/encryption-key";
import { serverEnv } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/secrets-crypto";
import { resolveApiKey, setApiKey } from "@/lib/secrets";
import { getUserSetting, setUserSetting } from "@/lib/user-settings";

const settingsRoute = await import("@/app/api/settings/route");
const keysRoute = await import("@/app/api/settings/keys/route");

let a: TestUser;
let b: TestUser;

beforeEach(async () => {
  resetDb();
  delete process.env.SHARED_KEYS;
  a = await createTestUser("test@example.com");
  b = await createTestUser("other@example.com");
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SHARED_KEYS;
});

const stored = (userId: string) => getUserSetting(userId, "api-keys") as Record<string, string> | undefined;

describe("API keys at rest", () => {
  it("are stored encrypted, never in plain text", () => {
    setApiKey(a.id, "gemini", "AIza-secret-of-a");
    expect(stored(a.id)?.gemini).toMatch(/^v1\./);
    const row = db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, a.id)).all();
    expect(JSON.stringify(row)).not.toContain("AIza-secret-of-a");
    expect(resolveApiKey(a.id, "gemini")).toEqual({ key: "AIza-secret-of-a", source: "app" });
  });

  it("removing a key removes it", () => {
    setApiKey(a.id, "groq", "gsk-a");
    setApiKey(a.id, "groq", null);
    expect(stored(a.id)?.groq).toBeUndefined();
    expect(resolveApiKey(a.id, "groq")?.source).toBe("env");
  });

  it("a plain-text key from an older version still works and is re-encrypted on first read", () => {
    setUserSetting(a.id, "api-keys", { gemini: "AIza-plain" });
    expect(resolveApiKey(a.id, "gemini")?.key).toBe("AIza-plain");
    expect(stored(a.id)?.gemini).toMatch(/^v1\./);
    expect(resolveApiKey(a.id, "gemini")?.key).toBe("AIza-plain");
  });

  it("a key that does not decrypt counts as no key, with a warning that has neither key nor ciphertext", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.SHARED_KEYS = "false";
    const foreign = encryptSecret("AIza-lost", Buffer.alloc(32, 9), `${a.id}:gemini`);
    setUserSetting(a.id, "api-keys", { gemini: foreign });
    expect(resolveApiKey(a.id, "gemini")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0])).not.toContain("AIza-lost");
    expect(String(warn.mock.calls[0])).not.toContain(foreign);
    expect(stored(a.id)?.gemini).toBe(foreign);
  });
});

describe("isolation between accounts", () => {
  it("B never resolves A's keys, and the stored value of A does not decrypt as B's", () => {
    process.env.SHARED_KEYS = "false";
    setApiKey(a.id, "gemini", "AIza-secret-of-a");
    expect(resolveApiKey(b.id, "gemini")).toBeNull();
    setApiKey(b.id, "gemini", "AIza-secret-of-b");
    expect(resolveApiKey(a.id, "gemini")?.key).toBe("AIza-secret-of-a");
    expect(resolveApiKey(b.id, "gemini")?.key).toBe("AIza-secret-of-b");

    // A row copied from A to B is useless to B (the owner is part of the authenticated data).
    setUserSetting(b.id, "api-keys", { gemini: stored(a.id)!.gemini });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveApiKey(b.id, "gemini")).toBeNull();
  });

  it("with SHARED_KEYS (default) an account without keys uses the server's; with false it uses none", () => {
    setApiKey(a.id, "groq", "gsk-a");
    expect(resolveApiKey(b.id, "groq")).toEqual({ key: "test-groq-key", source: "env" });
    process.env.SHARED_KEYS = "false";
    expect(resolveApiKey(b.id, "groq")).toBeNull();
    expect(resolveApiKey(a.id, "groq")?.key).toBe("gsk-a");
  });

  it("the routes save and show only the signed-in account's keys, and never send the key", async () => {
    process.env.SHARED_KEYS = "false";
    const put = (user: TestUser, apiKey: string) =>
      keysRoute.PUT(
        user.request("http://test/api/settings/keys", {
          method: "PUT",
          body: JSON.stringify({ provider: "gemini", apiKey }),
        }),
      );
    expect((await put(a, "AIzaSyA-visible-secret-1234")).status).toBe(200);

    const forA = await (await settingsRoute.GET(a.request("http://test/api/settings"))).text();
    expect(forA).toContain("••••1234");
    expect(forA).not.toContain("visible-secret");
    const forB = JSON.parse(await (await settingsRoute.GET(b.request("http://test/api/settings"))).text());
    expect(forB.providers.gemini.configured).toBe(false);
  });
});

describe("the key of the single-user app", () => {
  const legacy = () => db.select().from(schema.settings).where(eq(schema.settings.key, "api-keys")).get();

  it("moves, encrypted, to the first account on first use, and the old row goes away", () => {
    process.env.SHARED_KEYS = "false";
    db.insert(schema.settings)
      .values({ key: "api-keys", value: { gemini: "AIza-old", groq: "gsk-old" } })
      .run();

    expect(resolveApiKey(b.id, "gemini")).toBeNull(); // not the first account: nothing moves
    expect(legacy()).toBeDefined();

    expect(resolveApiKey(a.id, "gemini")?.key).toBe("AIza-old");
    expect(resolveApiKey(a.id, "groq")?.key).toBe("gsk-old");
    expect(legacy()).toBeUndefined();
    expect(stored(a.id)?.gemini).toMatch(/^v1\./);
    expect(JSON.stringify(db.select().from(schema.userSettings).all())).not.toContain("AIza-old");
    expect(resolveApiKey(b.id, "gemini")).toBeNull();
  });

  it("is idempotent, and what the account already saved wins", () => {
    db.insert(schema.settings)
      .values({ key: "api-keys", value: { gemini: "AIza-old", groq: "gsk-old" } })
      .run();
    setApiKey(a.id, "gemini", "AIza-new"); // adopts first, then saves over
    expect(resolveApiKey(a.id, "gemini")?.key).toBe("AIza-new");
    expect(resolveApiKey(a.id, "groq")?.key).toBe("gsk-old");
    const first = stored(a.id);
    expect(resolveApiKey(a.id, "groq")?.key).toBe("gsk-old");
    expect(stored(a.id)).toEqual(first);
  });

  it("uses the current key: what is stored decrypts with it", () => {
    setApiKey(a.id, "gemini", "AIza-x");
    const result = decryptSecret(stored(a.id)!.gemini, getEncryptionKeys(serverEnv()), `${a.id}:gemini`);
    expect(result).toMatchObject({ ok: true, plain: "AIza-x", stale: false });
  });
});
