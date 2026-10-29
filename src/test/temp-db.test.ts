import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertSafeDatabasePath, isInTempDir, makeTempDir, removeTempDir } from "./temp-db";

describe("database path guard", () => {
  it("rejects anything outside the OS temp directory, however it is spelled", () => {
    const live = path.join(os.homedir(), "personal-projects/english-companion/data/companion.db");
    for (const file of ["data/companion.db", "./data/dev.db", path.resolve("data/x.db"), live, "x.db"]) {
      expect(isInTempDir(file), file).toBe(false);
      expect(() => assertSafeDatabasePath(file), file).toThrow(/temp/);
    }
  });

  it("rejects a path that goes through the temp directory with ..", () => {
    expect(() => assertSafeDatabasePath(path.join(os.tmpdir(), "..", "x", "test.db"))).toThrow();
  });

  it("rejects a symlink in the temp directory that points outside it", () => {
    const dir = makeTempDir();
    try {
      const link = path.join(dir, "link");
      fs.symlinkSync(path.resolve("data"), link);
      expect(() => assertSafeDatabasePath(path.join(link, "companion.db"))).toThrow(/temp/);
    } finally {
      removeTempDir(dir);
    }
  });

  it("accepts a file in a temp directory", () => {
    const dir = makeTempDir();
    try {
      expect(() => assertSafeDatabasePath(path.join(dir, "test.db"))).not.toThrow();
    } finally {
      removeTempDir(dir);
    }
  });

  it("is satisfied by the database the setup chose for this file", () => {
    expect(() => assertSafeDatabasePath(process.env.DATABASE_PATH ?? "")).not.toThrow();
  });
});
