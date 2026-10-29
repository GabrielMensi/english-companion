import { expect, test as base } from "@playwright/test";

/** The app sends a nonce-based Content-Security-Policy: any violation the browser logs fails the test. */
const CSP_VIOLATION = /content security policy|violates the following|refused to (evaluate|execute|load)/i;

/** The console message of a violation has other wording than the event: "script-src eval" also covers it. */
function isKnown(violation: string, known: string[]): boolean {
  return (
    known.includes(violation) || (known.includes("script-src eval") && /evaluate a string|unsafe-eval/i.test(violation))
  );
}

export const test = base.extend<{ cspGuard: void; knownCspViolations: string[] }>({
  /** Violations a test tolerates ("<directive> <blocked uri>"), each with a comment saying why. */
  knownCspViolations: [[], { option: true }],
  cspGuard: [
    async ({ page, knownCspViolations }, use) => {
      const violations: string[] = [];
      // The browser event, not only its console message (whose wording can change).
      await page.exposeFunction("__reportCspViolation", (text: string) => violations.push(text));
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          void (window as unknown as { __reportCspViolation: (t: string) => void }).__reportCspViolation(
            `${event.violatedDirective} ${event.blockedURI}`,
          );
        });
      });
      page.on("console", (message) => {
        if (CSP_VIOLATION.test(message.text())) violations.push(message.text());
      });
      page.on("pageerror", (error) => {
        if (CSP_VIOLATION.test(error.message)) violations.push(error.message);
      });
      await use();
      expect(
        violations.filter((v) => !isKnown(v, knownCspViolations)),
        "Content-Security-Policy violations",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** What the fake AI (src/lib/ai/fake-model.ts) corrects: two mistakes it knows. */
export const MESSAGE = "I goed to the park with my childs.";
