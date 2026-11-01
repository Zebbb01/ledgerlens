import { defineConfig, devices } from "@playwright/test";

// Local stand-ins for the Azure services: Azurite (Blob + Queue), an in-memory
// MongoDB, and a mock Document Intelligence server, plus the queue worker.
const env = {
  MONGODB_URI: "mongodb://127.0.0.1:27019/",
  AZURE_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
  DI_ENDPOINT: "http://127.0.0.1:4011",
  DI_KEY: "local",
  MONTHLY_PAGE_CAP: "450",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  // The dev server compiles each route on first use, so the first navigation of a
  // run can take several seconds.
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3200", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx azurite --silent --inMemoryPersistence --skipApiVersionCheck --loose",
      port: 10000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run services",
      url: "http://127.0.0.1:4011/health",
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3200",
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
