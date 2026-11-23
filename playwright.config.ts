import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3300);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a production build (`next build && next start`), so dev-only
 * preview helpers are off and the app behaves exactly as shipped. No API keys are set in the
 * web server environment, so the app runs in Basic Mode.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/e2e-report" }]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        permissions: ["clipboard-read", "clipboard-write"],
      },
      testMatch: /responsive\.spec\.ts|journey\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // Ensure Basic Mode regardless of the developer's shell environment.
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "",
      // The suite runs every journey from one IP; production keeps the default of 30.
      RATE_LIMIT_PER_MINUTE: "600",
    },
  },
});
