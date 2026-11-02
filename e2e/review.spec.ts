import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function runSample(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/documents\/[\w-]+$/);
}

const status = (page: Page) => page.getByTestId("doc-status");
const check = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
// Passed checks are folded away under "Show N passed checks".
const showPassed = (page: Page) => page.getByText(/^Show \d+ passed/).click();

test("a sample VAT invoice is read, passes every check and can be approved", async ({ page }) => {
  await runSample(page, "VAT invoice");

  await expect(status(page)).toHaveText("Ready to approve", { timeout: 60_000 });
  await expect(page.getByText("Every check passed. Approve to export it.")).toBeVisible();
  await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("Bluepeak Office Supply Corp.");
  await expect(page.getByLabel("Total", { exact: true })).toHaveValue("7,392.00");
  await showPassed(page);
  await expect(check(page, "VAT is 12%")).toContainText("Passed");

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(status(page)).toHaveText("Approved");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const csv = await readFile(await (await download).path(), "utf8");
  expect(csv).toContain("Bluepeak Office Supply Corp.,123-456-789-000,INV-2026-1042");
  expect(csv).toContain(",approved,");
});

test("the wrong-total sample blocks approval until a person fixes the total", async ({ page }) => {
  await runSample(page, "Wrong total");

  await expect(status(page)).toHaveText("Needs review", { timeout: 60_000 });
  await expect(check(page, "Totals add up")).toContainText("Failed");
  await expect(page.getByLabel("Total", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();

  await page.getByRole("button", { name: "Go to Total" }).first().click();
  await expect(page.getByLabel("Total", { exact: true })).toBeFocused();

  await page.getByLabel("Total", { exact: true }).fill("1680.00");
  await page.getByRole("button", { name: "Save changes" }).click();

  await showPassed(page);
  await expect(check(page, "Totals add up")).toContainText("Passed");
  await expect(page.getByLabel("Total", { exact: true })).not.toHaveAttribute("aria-invalid");
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
});

test("running the same invoice twice reuses the analysis and flags the duplicate", async ({ page }) => {
  await runSample(page, "VAT invoice");
  await expect(status(page)).toHaveText("Ready to approve", { timeout: 60_000 });

  await runSample(page, "VAT invoice");
  await expect(status(page)).toHaveText("Needs review", { timeout: 60_000 });
  await expect(check(page, "Not a duplicate")).toContainText("Failed");
  await expect(page.getByText("Reused the analysis of an identical file")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("row").filter({ hasText: "Bluepeak Office Supply Corp." })).toHaveCount(2);
});
