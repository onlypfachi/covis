import { defineConfig, devices } from "@playwright/test";

// Expects the stack running with the fake agent:  COVIS_FAKE_AGENT=1 make dev
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/globalSetup.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5187",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
