// Browser tests for the public site and /admin, run against the real build served
// with Vercel's clean URLs (e2e/serve.mjs) on 4391 (E2E_PORT), so they never collide with
// `npm run dev` on 4321. /api/gift is mocked inside the admin tests, so nothing here
// reads or writes the real gift list. Set E2E_SKIP_BUILD=1 to reuse an existing build.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4391);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "phone-chrome", use: { ...devices["Pixel 7"] } },
    { name: "phone-safari", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}node e2e/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
