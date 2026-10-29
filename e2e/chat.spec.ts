import { expect, MESSAGE, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

test("a correction message shows the correction card and a mistake can be discarded", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New chat" }).first().click();
  await expect(page).toHaveURL(/\/chat\//);

  await page.getByRole("textbox").fill(MESSAGE);
  await page.getByRole("button", { name: "Send" }).click();

  const mistakes = page.getByRole("region", { name: "Mistakes" });
  await expect(mistakes.getByText("The past of 'go' is 'went'.")).toBeVisible();
  await expect(mistakes.getByText("The plural of 'child' is 'children'.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy corrected" })).toBeVisible();

  // Discard a mistake: it moves to the discarded group and leaves the count.
  await mistakes.getByRole("button", { name: "Discard" }).first().click({ force: true });
  await expect(page.getByText(/1 discarded/)).toBeVisible();
  await expect(mistakes.getByRole("heading", { name: "1 mistake" })).toBeVisible();
});

test("a message that fails can be retried", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New chat" }).first().click();
  await expect(page).toHaveURL(/\/chat\//);

  // The fake AI fails the first time a message has the "fail-once" marker.
  await page.getByRole("textbox").fill("I goed to the cinema, fail-once.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Retry" }).click();

  const mistakes = page.getByRole("region", { name: "Mistakes" });
  await expect(mistakes.getByText("The past of 'go' is 'went'.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("a conversation answers with a reply", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page).toHaveURL(/\/chat\//);
  await page.getByRole("textbox").fill("I like this park.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("That sounds great. Tell me more about it.")).toBeVisible();
});
