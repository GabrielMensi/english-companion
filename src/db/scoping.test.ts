// A guard on the source (docs/platform/AUTH_MULTIUSER.md, "Tests de aislamiento" 6): every query on a
// table of user data in the app's code names the owner (`owned(...)` or a `userId` value). A new
// query that forgets it fails here. Routes and pages go through the lib functions, which all take
// the user; the isolation tests (src/app/api/isolation.test.ts) check the behavior.
// Blind spots (see docs/platform/TESTING.md): a table held in a variable, a join onto a base table that is not
// owned, and anything under scripts/ (the evals are operator-only and scope by hand).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLOBAL_SETTINGS, OWNED_TABLES } from "./claim";

const camel = (name: string) => name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
/** `missed_exercises` -> `missedExercises`; `user_settings` and `class_sessions` (owned for good, never NULL) are checked too. */
const TABLES = [...OWNED_TABLES, "user_settings", "class_sessions"].map(camel);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Files with queries on user data: the app's code (the schema, the migrations and test helpers are not queries). */
const files = sourceFiles("src").filter((f) => !f.startsWith(path.join("src", "test")) && !f.includes("src/db/"));

const STATEMENT_END = /\.(run|all|get|sync)\(\)/;
const QUERY = new RegExp(`\\.(from|update|delete|insert)\\(schema\\.(${TABLES.join("|")})\\)`, "g");

/** The text of the query that starts at `index`, up to its terminal call. */
function statementAt(source: string, index: number): string {
  const rest = source.slice(index, index + 2500);
  const end = rest.search(STATEMENT_END);
  return end === -1 ? rest : rest.slice(0, end);
}

const queries = files.flatMap((file) => {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(QUERY)].map((m) => ({
    where: `${file}:${source.slice(0, m.index).split("\n").length} ${m[0]}`,
    kind: m[1],
    text: statementAt(source, m.index),
  }));
});

describe("the legacy global settings table", () => {
  it("only the API keys use it, and the claim leaves exactly those keys in place", () => {
    const users = files.filter((file) => /schema\.settings\b/.test(fs.readFileSync(file, "utf8")));
    // A new global key means a new file here (or a new key in secrets.ts): declare it in GLOBAL_SETTINGS
    // (src/db/claim.ts) on purpose, or the claim moves it to one user. Per-user data goes to user_settings.
    expect(users).toEqual([path.join("src", "lib", "secrets.ts")]);
    expect(fs.readFileSync(users[0], "utf8")).toContain(`"${GLOBAL_SETTINGS[0]}"`);
    expect(GLOBAL_SETTINGS).toEqual(["api-keys"]);
  });
});

describe("queries on user data name their owner", () => {
  it("finds the queries (the scan works)", () => {
    expect(queries.length).toBeGreaterThan(60);
  });

  it("every select, update and delete filters by the user, every insert sets it", () => {
    const unscoped = queries
      .filter((q) => (q.kind === "insert" ? !/userId/.test(q.text) : !/owned\(|userId/.test(q.text)))
      .map((q) => q.where);
    expect(unscoped).toEqual([]);
  });

  it("db.query (relational) reads are scoped too", () => {
    const relational = files.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return [...source.matchAll(/db\.query\.\w+\s*\.find\w+\(/g)].map((m) => ({
        where: `${file} ${m[0]}`,
        text: source.slice(m.index, m.index + 400),
      }));
    });
    expect(relational.length).toBeGreaterThan(0);
    expect(relational.filter((q) => !/owned\(|userId/.test(q.text)).map((q) => q.where)).toEqual([]);
  });
});
