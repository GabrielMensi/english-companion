import { describe, expect, it } from "vitest";

import { type MigrationFile, pendingMigrations } from "@/db/migrations-core";

const m = (folderMillis: number): MigrationFile => ({ folderMillis, hash: `h${folderMillis}`, sql: [] });
const ALL = [m(100), m(200), m(300)];

describe("pendingMigrations", () => {
  it("returns every migration on an empty database", () => {
    expect(pendingMigrations(ALL, undefined)).toEqual(ALL);
    expect(pendingMigrations(ALL, null)).toEqual(ALL);
  });

  it("returns only the migrations newer than the last applied one", () => {
    expect(pendingMigrations(ALL, 100).map((x) => x.folderMillis)).toEqual([200, 300]);
  });

  it("returns nothing when the database is up to date", () => {
    expect(pendingMigrations(ALL, 300)).toEqual([]);
  });

  it("accepts created_at as a numeric string, like SQLite may return it", () => {
    expect(pendingMigrations(ALL, "200").map((x) => x.folderMillis)).toEqual([300]);
  });

  it("matches Drizzle's rule: older unapplied migrations are not run", () => {
    // Drizzle compares only against the newest row, so a migration older than it is skipped.
    expect(pendingMigrations([m(50), m(400)], 300).map((x) => x.folderMillis)).toEqual([400]);
  });
});
