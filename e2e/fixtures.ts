import { expect, test as base } from "@playwright/test";

/** The app sends a nonce-based Content-Security-Policy: any violation the browser logs fails the test. */
const CSP_VIOLATION = /content security policy|violates the following/i;

export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        if (CSP_VIOLATION.test(message.text())) violations.push(message.text());
      });
      page.on("pageerror", (error) => {
        if (CSP_VIOLATION.test(error.message)) violations.push(error.message);
      });
      await use();
      expect(violations, "Content-Security-Policy violations in the console").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** What the fake AI (src/lib/ai/fake-model.ts) corrects: two mistakes it knows. */
export const MESSAGE = "I goed to the park with my childs.";
