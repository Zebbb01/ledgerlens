import { expect, test } from "@playwright/test";

const upload = "Upload an invoice or receipt";

test("an uploaded PDF is queued, read and shown for review", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(upload).setInputFiles("samples/cloudnote-saas-invoice.pdf");

  await expect(page).toHaveURL(/\/documents\/[\w-]+$/);
  await expect(page.getByTestId("doc-status")).toHaveText("Ready to approve", { timeout: 60_000 });
  await expect(page.getByLabel("Currency")).toHaveValue("USD");
  await expect(page.getByTitle("Document preview")).toBeVisible();
});

test("a file that is not a PDF or image is refused", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(upload).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });

  await expect(page.getByRole("alert").filter({ hasText: "Only PDF, PNG and JPEG" })).toBeVisible();
});

test("a document the service cannot read shows the reason and can be run again", async ({ page }) => {
  // A valid PNG the mock service has no stored result for.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.goto("/");
  await page.getByLabel(upload).setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });

  await expect(page.getByTestId("doc-status")).toHaveText("Failed", { timeout: 60_000 });
  await expect(page.getByText("Mock: unknown document.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();
});

test("documents are private to the browser that added them", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /SaaS invoice/ }).click();
  await expect(page).toHaveURL(/\/documents\/[\w-]+$/);

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(page.url());
  await expect(stranger.getByText("Document not found")).toBeVisible();
  await stranger.goto("/");
  await expect(stranger.getByText("No documents yet")).toBeVisible();
});
