import { randomBytes } from "node:crypto";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/secrets-crypto";
import { makeTempDir, openDatabase, removeTempDir } from "@/test/temp-db";

import { migrate } from "./migrate";
import { reencryptKeys } from "./reencrypt";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("reencryptKeys", () => {
  it("moves every key to the current key, keeps undecryptable ones, and can run again", () => {
    const dir = makeTempDir("companion-reenc-");
    const sqlite = openDatabase(path.join(dir, "t.db"));
    cleanups.push(() => {
      sqlite.close();
      removeTempDir(dir);
    });
    migrate(sqlite, path.resolve("drizzle"));
    const at = 1_790_000_000_000;
    sqlite.exec(
      `INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('ana', 'Ana', 'ana@x.com', ${at}, ${at}), ('bo', 'Bo', 'bo@x.com', ${at}, ${at})`,
    );
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    const lost = encryptSecret("gsk-lost", randomBytes(32), "bo:groq");
    const put = sqlite.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'api-keys', ?)");
    put.run("ana", JSON.stringify({ gemini: encryptSecret("AIza-ana", oldKey, "ana:gemini"), groq: "gsk-plain" }));
    put.run("bo", JSON.stringify({ groq: lost }));

    const result = reencryptKeys(sqlite, [newKey, oldKey]);
    expect(result).toEqual({ reencrypted: 2, failed: [{ userId: "bo", provider: "groq" }] });

    const read = (id: string) =>
      JSON.parse(sqlite.prepare("SELECT value FROM user_settings WHERE user_id = ?").pluck().get(id) as string);
    const ana = read("ana");
    expect(decryptSecret(ana.gemini, [newKey], "ana:gemini")).toMatchObject({
      ok: true,
      plain: "AIza-ana",
      stale: false,
    });
    expect(decryptSecret(ana.groq, [newKey], "ana:groq")).toMatchObject({ ok: true, plain: "gsk-plain" });
    expect(read("bo").groq).toBe(lost);

    expect(reencryptKeys(sqlite, [newKey]).failed).toHaveLength(1);
  });
});
