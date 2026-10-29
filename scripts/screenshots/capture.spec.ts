import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { buildDemoExport } from "./demo-data";

const OUT = path.join(process.cwd(), "docs", "screenshots");

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // A new database: the first account needs no allowlist.
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Lucas");
  await page.getByLabel("Email").fill("lucas@example.com");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();

  const response = await page.request.post("/api/data/import", { data: buildDemoExport() });
  expect(response.ok(), await response.text()).toBe(true);
});

test.afterAll(async () => {
  await page.close();
});

/** Waits for the page to settle (data loaded, chart animations done) and saves it. */
async function shot(name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** Scrolls every scrollable area to the top (the chat opens at its last message). */
async function scrollToTop() {
  await page.evaluate(() => document.querySelectorAll("*").forEach((el) => el.scrollTo({ top: 0 })));
}

async function openChat(title: string) {
  await page.goto("/");
  await page.getByRole("link", { name: title }).first().click();
  await expect(page).toHaveURL(/\/chat\//);
}

test("chat: correction", async () => {
  await openChat("New project at work");
  await expect(page.getByRole("region", { name: "Mistakes" })).toBeVisible();
  await scrollToTop();
  await shot("chat-correction");
});

test("chat: conversation", async () => {
  await openChat("Job interview practice");
  await expect(page.getByText("How did you measure it").first()).toBeVisible();
  await shot("chat-conversation");
});

test("today", async () => {
  await page.goto("/");
  await shot("today");
});

test("dashboard", async () => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await shot("dashboard");
});

test("practice", async () => {
  await page.goto("/practice");
  await shot("practice");
});

test("flashcards", async () => {
  await page.goto("/flashcards?deck=mistakes");
  await page.getByRole("textbox", { name: "Your answer" }).fill("depends on");
  await page.getByRole("button", { name: "Show answer" }).click();
  await shot("flashcards");
});

test("vocabulary", async () => {
  await page.goto("/vocabulary");
  await shot("vocabulary");
});

test("read aloud", async () => {
  await page.goto("/read-aloud");
  await shot("read-aloud");
});

test("class", async () => {
  await page.goto("/class");
  await shot("class");
});

test("insights", async () => {
  await page.goto("/insights");
  await shot("insights");
});

test("settings", async () => {
  await page.goto("/settings");
  await shot("settings");
});

test("chat: dark mode", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openChat("New project at work");
  await expect(page.getByRole("region", { name: "Mistakes" })).toBeVisible();
  await scrollToTop();
  await shot("chat-correction-dark");
  await page.emulateMedia({ colorScheme: "light" });
});
