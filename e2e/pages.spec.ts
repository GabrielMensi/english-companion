import { expect, test } from "./fixtures";

// These run after chat.spec.ts (alphabetical order, one worker), so the account already has mistakes.

test("the dashboard renders with the mistakes of the chats", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText(/plurals|verb forms/i).first()).toBeVisible();
});

test("a flashcard of a mistake can be reviewed", async ({ page }) => {
  await page.goto("/flashcards?deck=mistakes");
  await page.getByRole("textbox", { name: "Your answer" }).fill("I went to the park");
  await page.getByRole("button", { name: "Show answer" }).click();
  const review = page.waitForResponse(
    (r) => r.url().includes("/api/flashcards/reviews") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Good/ }).click();
  expect((await review).ok()).toBe(true);
});

test("practice generates a set of exercises", async ({ page }) => {
  await page.goto("/practice");
  await page.getByRole("button", { name: "Start", exact: true }).first().click();
  await expect(page).toHaveURL(/\/chat\//);
  await expect(page.getByText("___").first()).toBeVisible();
});

// KNOWN ISSUE #153 ("CSP blocks eval on /settings in production"): something on /settings (the voice settings'
// speech libraries) evaluates strings and the CSP blocks it. Another team is fixing it; remove this
// tolerance (the whole describe) when #153 lands.
test.describe("settings", () => {
  test.use({ knownCspViolations: ["script-src eval"] });

  test("the settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });
});
