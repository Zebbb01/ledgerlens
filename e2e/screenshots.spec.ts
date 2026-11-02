// Regenerates the screenshots in docs/screenshots, light and dark. Skipped unless SCREENSHOTS=1:
//   SCREENSHOTS=1 npx playwright test screenshots
import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to regenerate screenshots.");
// Full Chromium in new headless mode, which has the built-in PDF viewer. caret: "initial"
// stops Playwright from styling inputs, which React would report as a hydration mismatch.
test.use({ viewport: { width: 1440, height: 900 }, channel: "chromium", deviceScaleFactor: 2 });

async function run(page: Page, title: string, status: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByTestId("doc-status")).toHaveText(status, { timeout: 60_000 });
  return page.url();
}

for (const scheme of ["light", "dark"] as const) {
  test(`screenshots (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const suffix = scheme === "dark" ? "-dark" : "";
    await page.goto("/");
    await expect(page.getByText("No documents yet.")).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/landing${suffix}.png`, caret: "initial" });

    await run(page, "SaaS invoice", "Ready to approve");
    await run(page, "Official receipt", "Needs review");
    const ready = await run(page, "VAT invoice", "Ready to approve");
    const blocked = await run(page, "Wrong total", "Needs review");
    await page.waitForTimeout(1500); // let the PDF viewer paint
    await page.screenshot({ path: `docs/screenshots/review-blocked${suffix}.png`, caret: "initial" });

    await page.goto(ready);
    await expect(page.getByTestId("doc-status")).toHaveText("Ready to approve");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/screenshots/review-ready${suffix}.png`, caret: "initial" });

    await page.goto("/#add");
    await expect(page.getByRole("row")).toHaveCount(5);
    await page.screenshot({ path: `docs/screenshots/home${suffix}.png`, caret: "initial" });
    expect(blocked).toContain("/documents/");
  });
}
