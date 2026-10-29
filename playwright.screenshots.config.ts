// Screenshots for the README (`pnpm screenshots`): the same throwaway server and fake AI as the E2E tests
// (playwright.config.ts), with invented demo data (scripts/screenshots/demo-data.ts). Never touches data/.
import { defineConfig, devices } from "@playwright/test";

import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./scripts/screenshots",
  retries: 0,
  timeout: 120_000,
  reporter: [["list"], ["./e2e/cleanup-reporter.ts"]],
  use: { ...base.use, trace: "off" },
  // A Groq key too (never called), so dictation and read aloud show as available.
  webServer:
    base.webServer && !Array.isArray(base.webServer)
      ? { ...base.webServer, env: { ...base.webServer.env, GROQ_API_KEY: "screenshots-fake-key" } }
      : base.webServer,
  projects: [
    {
      name: "screenshots",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: "light",
      },
    },
  ],
});
