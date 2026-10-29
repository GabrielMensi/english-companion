import { STORAGE_STATE } from "../playwright.config";

import { expect, test as setup } from "./fixtures";

/** The database is new, so the first account can be created: its session is reused by every other flow. */
setup("sign up the first account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Learner");
  await page.getByLabel("Email").fill("e2e@example.com");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$|\/dashboard/);
  await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
