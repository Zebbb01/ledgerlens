import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 120_000,
  },
});
