// End-to-end smoke tests (docs/platform/TESTING.md). They run against `next build && next start` with a
// throwaway database and a fake AI (AI_FAKE=1), never against data/. Not part of `pnpm test`: `pnpm test:e2e`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3750);
const BASE_URL = `http://127.0.0.1:${PORT}`;
/** Inside the system's temp directory, so it can never be the app's real database. */
const DATA_DIR = path.join(fs.realpathSync(os.tmpdir()), "english-companion-e2e");

export const STORAGE_STATE = path.join(DATA_DIR, "auth-state.json");

export default defineConfig({
  testDir: "./e2e",
  // One server and one database: the flows share the account created by the setup project.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
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
    command: `rm -rf "${DATA_DIR}" && mkdir -p "${DATA_DIR}" && pnpm build && pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    url: `${BASE_URL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER && !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_PATH: path.join(DATA_DIR, "companion.db"),
      AI_FAKE: "1",
      E2E_TEST_SERVER: "1",
      // The fake model needs no key, but the app wants a provider to be configured.
      GOOGLE_GENERATIVE_AI_API_KEY: "e2e-fake-key",
      GROQ_API_KEY: "",
      ALLOWED_HOSTS: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
