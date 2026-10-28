import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeDatabasePath, isUnderDataDir } from "./temp-db";

describe("database path guard", () => {
  it("rejects anything under data/, however it is spelled", () => {
    for (const file of ["data/companion.db", "./data/dev.db", path.resolve("data/nested/x.db"), "data/../data/a.db"]) {
      expect(isUnderDataDir(file), file).toBe(true);
      expect(() => assertSafeDatabasePath(file), file).toThrow(/data\//);
    }
  });

  it("accepts temp files and look-alike folders", () => {
    for (const file of ["/tmp/x/test.db", "database/x.db", "mydata/x.db", "data.db"]) {
      expect(isUnderDataDir(file), file).toBe(false);
    }
  });

  it("is already applied to the database the setup chose for this file", () => {
    expect(process.env.DATABASE_PATH).toBeTruthy();
    expect(() => assertSafeDatabasePath(process.env.DATABASE_PATH ?? "")).not.toThrow();
  });
});
