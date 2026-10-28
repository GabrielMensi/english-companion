import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Only measured with `pnpm test:coverage`. The floor covers src/lib only (docs/platform/TESTING.md).
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts"],
      reporter: ["text-summary"],
      // Baseline when added (2026-10-28): statements 80.8, branches 76.1, functions 76.4, lines 81.5.
      // A few points below it; raise it as tests are added, never lower it to make a PR pass.
      thresholds: { statements: 78, branches: 73, functions: 73, lines: 78 },
    },
  },
});
