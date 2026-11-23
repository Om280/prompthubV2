import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3300);
const BASE_URL = `http://localhost:${PORT}`;
const FAKE_SUPABASE_PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54399);
const FAKE_SUPABASE_URL = `http://127.0.0.1:${FAKE_SUPABASE_PORT}`;

/**
 * End-to-end tests run against a production build (`next build && next start`), so dev-only
 * preview helpers are off and the app behaves exactly as shipped.
 *
 * Auth runs against a local fake of Supabase Auth (tests/e2e/fake-supabase), never a real project:
 * the app is built with NEXT_PUBLIC_SUPABASE_URL pointing at it (NEXT_PUBLIC_ values are inlined at
 * build time). There are no AI keys anywhere, so the app runs in Basic Mode.
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
  webServer: [
    {
      command: "node tests/e2e/fake-supabase/server.mjs",
      url: `${FAKE_SUPABASE_URL}/__test/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { FAKE_SUPABASE_PORT: String(FAKE_SUPABASE_PORT) },
    },
    {
      command: `npm run build && npx next start -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
        // A placeholder: the fake server doesn't check it. Not a real key.
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_fake_not_a_real_key",
        // The suite runs every journey from one IP and one test user; production keeps 30 and 20.
        RATE_LIMIT_PER_MINUTE: "600",
        RATE_LIMIT_PER_USER_PER_MINUTE: "600",
      },
    },
  ],
});
