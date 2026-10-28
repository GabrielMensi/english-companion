// Integration test (docs/platform/TESTING.md): settings and API keys. The key must never come back whole.
import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb, schema } from "@/test/db";

const settingsRoute = await import("@/app/api/settings/route");
const keysRoute = await import("@/app/api/settings/keys/route");

const SECRET = "AIzaSy-super-secret-key-1234";

type Status = { configured: boolean; source: "app" | "env" | null; detail: string | null };
type Body = { settings: Record<string, unknown>; providers: Record<string, Status> };

function patch(body: unknown) {
  return settingsRoute.PATCH(new Request("http://test/api/settings", { method: "PATCH", body: JSON.stringify(body) }));
}

function putKey(body: unknown) {
  return keysRoute.PUT(new Request("http://test/api/settings/keys", { method: "PUT", body: JSON.stringify(body) }));
}

beforeEach(() => resetDb());

describe("GET /api/settings", () => {
  it("returns the defaults and the provider status from the environment keys", async () => {
    const { settings, providers } = (await (await settingsRoute.GET()).json()) as Body;
    expect(settings.provider).toBeTruthy();
    expect(providers.gemini).toMatchObject({ configured: true, source: "env" });
  });
});

describe("PATCH /api/settings", () => {
  it("saves a partial update and keeps the rest", async () => {
    const before = ((await (await settingsRoute.GET()).json()) as Body).settings;
    const res = await patch({ explanationLanguage: "en" });
    expect(res.status).toBe(200);

    const { settings } = (await (await settingsRoute.GET()).json()) as Body;
    expect(settings).toEqual({ ...before, explanationLanguage: "en" });
  });

  it("makes the chosen provider the primary and the old primary the first fallback", async () => {
    const { settings } = (await (await patch({ provider: "groq" })).json()) as Body;
    expect(settings.provider).toBe("groq");
    expect(settings.fallbacks).toEqual(["gemini"]);
  });

  it("rejects invalid values and saves nothing", async () => {
    expect((await patch({ provider: "openai" })).status).toBe(400);
    expect((await patch({ explanationLanguage: "fr" })).status).toBe(400);
    expect(db.select().from(schema.settings).all()).toHaveLength(0);
  });
});

describe("PUT /api/settings/keys", () => {
  it("saves a key and answers with the masked status only", async () => {
    const res = await putKey({ provider: "gemini", apiKey: `  ${SECRET}  ` });
    expect(res.status).toBe(200);
    const text = await res.text();

    expect(text).not.toContain(SECRET);
    const { providers } = JSON.parse(text) as { providers: Record<string, Status> };
    expect(providers.gemini).toEqual({ configured: true, source: "app", detail: "••••1234" });

    // Nor does the settings endpoint ever include it.
    expect(await (await settingsRoute.GET()).text()).not.toContain(SECRET);
  });

  it("falls back to the environment key when the saved one is removed", async () => {
    await putKey({ provider: "gemini", apiKey: SECRET });
    const { providers } = (await (await putKey({ provider: "gemini", apiKey: null })).json()) as Body;
    expect(providers.gemini).toMatchObject({ configured: true, source: "env" });
  });

  it("rejects empty keys, unknown providers and oversized keys", async () => {
    expect((await putKey({ provider: "gemini", apiKey: "   " })).status).toBe(400);
    expect((await putKey({ provider: "openai", apiKey: "x" })).status).toBe(400);
    expect((await putKey({ provider: "groq", apiKey: "k".repeat(501) })).status).toBe(400);
  });
});
