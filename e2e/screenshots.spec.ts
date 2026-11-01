// Regenerates the screenshots in docs/screenshots. Skipped unless SCREENSHOTS=1:
//   SCREENSHOTS=1 npx playwright test screenshots
import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to regenerate screenshots.");
// Full Chromium in new headless mode, which has the built-in PDF viewer.
test.use({ viewport: { width: 1440, height: 900 }, channel: "chromium" });

async function run(page: Page, title: string, status: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByTestId("doc-status")).toHaveText(status, { timeout: 60_000 });
  return page.url();
}

test("screenshots", async ({ page }) => {
  await run(page, "SaaS invoice", "Ready to approve");
  await run(page, "Official receipt", "Needs review");
  const blocked = await run(page, "Wrong total", "Needs review");
  const ready = await run(page, "VAT invoice", "Ready to approve");
  await page.waitForTimeout(1500); // let the PDF viewer paint
  await page.screenshot({ path: "docs/screenshots/review-ready.png" });

  await page.goto(blocked);
  await expect(page.getByTestId("doc-status")).toHaveText("Needs review");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "docs/screenshots/review-blocked.png" });

  await page.goto("/");
  await expect(page.getByRole("row")).toHaveCount(5);
  await page.screenshot({ path: "docs/screenshots/home.png" });
  expect(ready).toContain("/documents/");
});
