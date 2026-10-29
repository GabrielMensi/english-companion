// Every table of user data has an owner (docs/platform/AUTH_MULTIUSER.md): a table added without
// `user_id` fails here, so it can't be forgotten while scoping queries.
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { OWNED_TABLES } from "./claim";
import * as schema from "./schema";

const tables = (
  Object.values(schema).filter((value) => is(value, SQLiteTable)) as Parameters<typeof getTableConfig>[0][]
).map((table) => getTableConfig(table));

/** Better Auth's own tables, and the legacy key-value table (emptied: its API keys moved to the first account). */
const WITHOUT_OWNER = new Set(["user", "session", "account", "verification", "rate_limit", "settings"]);

describe("schema ownership", () => {
  it("every table has a user_id foreign key to the account, with cascade", () => {
    const missing = tables.filter((t) => !WITHOUT_OWNER.has(t.name) && !t.columns.some((c) => c.name === "user_id"));
    expect(missing.map((t) => t.name)).toEqual([]);
    for (const table of tables.filter((t) => !WITHOUT_OWNER.has(t.name))) {
      const fk = table.foreignKeys.find((f) => f.reference().columns.some((c) => c.name === "user_id"));
      expect(fk?.reference().foreignTable, table.name).toBeDefined();
      expect(fk?.onDelete, table.name).toBe("cascade");
    }
  });

  it("the claim script knows exactly the tables with a nullable user_id", () => {
    const nullable = tables
      .filter((t) => t.columns.some((c) => c.name === "user_id" && !c.notNull))
      .map((t) => t.name)
      .sort();
    expect(nullable).toEqual([...OWNED_TABLES].sort());
  });

  it("the per-user settings are owned for good (never NULL)", () => {
    const userSettings = tables.find((t) => t.name === "user_settings")!;
    expect(userSettings.columns.find((c) => c.name === "user_id")?.notNull).toBe(true);
  });
});
