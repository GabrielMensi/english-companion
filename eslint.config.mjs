import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Stricter and type-aware rules (docs/platform/CODE_QUALITY.md). All are errors: lint must pass with 0 warnings.
  {
    files: ["**/*.{ts,tsx,mts}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // zod's runtime only through "@/lib/zod", which turns off its eval probe before any schema exists (#153).
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "zod", message: 'Import z from "@/lib/zod" (it configures zod for the CSP).' }],
          patterns: [{ group: ["zod/*"], message: 'Import z from "@/lib/zod" (it configures zod for the CSP).' }],
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Server logs must never carry API keys or the learner's text; the console stays for diagnostics.
      "no-console": ["error", { allow: ["debug", "warn", "error"] }],
      "import/no-duplicates": "error",
    },
  },
  // The eval scripts are CLIs: printing is their output.
  { files: ["scripts/**"], rules: { "no-console": "off" } },
  // Formatting is Prettier's job: turn off the stylistic rules that would fight it.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "scripts-dist/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
