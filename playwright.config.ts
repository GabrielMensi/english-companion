// End-to-end smoke tests (docs/platform/TESTING.md). They run against `next build && next start` with a
// throwaway database and a fake AI (AI_FAKE=1), never against data/. Not part of `pnpm test`: `pnpm test:e2e`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3750);
const BASE_URL = `http://127.0.0.1:${PORT}`;
/**
 * A new directory inside the system's temp directory for each run, so it can never be the app's real database
 * and two runs never share one. Playwright loads this file again in every worker: the path travels by env.
 */
process.env.E2E_DATA_DIR ??= fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "english-companion-e2e-"));
const DATA_DIR = process.env.E2E_DATA_DIR;

export const STORAGE_STATE = path.join(DATA_DIR, "auth-state.json");

export default defineConfig({
  testDir: "./e2e",
  // One server and one database: the flows share the account created by the setup project.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ...(process.env.CI ? ([["github"], ["html", { open: "never" }]] as const) : ([["list"]] as const)),
    ["./e2e/cleanup-reporter.ts"],
  ],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /signed-out\.spec\.ts/],
    },
    // Runs last: it signs the account out.
    {
      name: "signed-out",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["chromium"],
      testMatch: /signed-out\.spec\.ts/,
    },
  ],
  webServer: {
    // A fresh database each run, then the production build the tests are about.
    command: `pnpm build && pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    url: `${BASE_URL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_PATH: path.join(DATA_DIR, "companion.db"),
      AI_FAKE: "1",
      E2E_TEST_SERVER: "1",
      // The fake model needs no key, but the app wants a provider to be configured.
      GOOGLE_GENERATIVE_AI_API_KEY: "e2e-fake-key",
      GROQ_API_KEY: "",
      // Everything the app reads is pinned (an empty value counts as unset and wins over .env.local), so
      // a developer's own settings can't change the run.
      ALLOWED_HOSTS: "",
      BETTER_AUTH_URL: "",
      BETTER_AUTH_SECRET: "",
      TRUST_PROXY: "",
      CSP_REPORT_ONLY: "false",
      ENABLE_EVAL: "",
      MIGRATE_ON_START: "true",
      ASR_SAMPLES_DIR: path.join(DATA_DIR, "asr-samples"),
      PHONEME_MODEL_DIR: path.join(DATA_DIR, "models"),
      PHONEME_CHECK: "false",
      SIGNUP_ALLOWED_EMAILS: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
