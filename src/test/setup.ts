// Runs before every test file (vitest `setupFiles`). Gives each file its own throwaway database and
// replaces the edges (server-only, the AI providers), so the app's own code runs for real.
// See docs/platform/TESTING.md.
import { afterAll, beforeAll, vi } from "vitest";

import { assertSafeDatabasePath, removeTempDir, tempDatabasePath } from "./temp-db";

// "@/db" reads DATABASE_PATH when it is first imported, so it is set here, before any test import.
const { file, dir } = tempDatabasePath();
assertSafeDatabasePath(file);
process.env.DATABASE_PATH = file;
process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-gemini-key";
process.env.GROQ_API_KEY = "test-groq-key";
// Login: a fixed secret, and the emails `createTestUser` (src/test/auth.ts) can sign up with.
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
process.env.SIGNUP_ALLOWED_EMAILS = "test@example.com,other@example.com,third@example.com";
delete process.env.ALLOWED_HOSTS;

vi.mock("server-only", () => ({}));
// Only the providers' HTTP clients are replaced: resolveModel, the fallback chain and the streaming
// run for real. Control the answers with `fakeAi` from "@/test/ai".
vi.mock("@ai-sdk/google", async () => (await import("./ai")).googleModule());
vi.mock("@ai-sdk/groq", async () => (await import("./ai")).groqModule());

// Check the connection that was really opened (not just the variable): "@/db" is imported by the test
// file, so by now it exists if the file uses the database.
beforeAll(() => {
  const opened = (globalThis as { __sqlite?: { name: string } }).__sqlite;
  if (opened) assertSafeDatabasePath(opened.name);
});

afterAll(() => {
  // "@/db" keeps its connection in globalThis (for hot reload): close it so the next file in this
  // worker doesn't reuse a database that is about to be deleted.
  const g = globalThis as { __sqlite?: { close(): void } };
  g.__sqlite?.close();
  delete g.__sqlite;
  removeTempDir(dir);
});
