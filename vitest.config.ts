// Node-side tests: unit, API, security, scenario, data and built-site checks.
// Browser tests (e2e/) run in Playwright instead, see playwright.config.ts.
// Plain Vitest rather than Astro's getViteConfig: nothing here imports a .astro file,
// and skipping Astro's plugins keeps the run fast.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,mjs}"],
    // Forks, not threads: the API tests chdir into a temp folder for the local store.
    pool: "forks",
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      // scripts/ run as child processes in tests/scenario, which v8 coverage can't see.
      include: ["src/lib/**", "src/pages/api/**"],
      reporter: ["text", "html", "lcov"],
      // A floor, not a goal: CI fails if coverage of the logic drops below today's level.
      // Measured 2026-11-18: 94.9% lines, 87.5% branches, 91% functions.
      thresholds: { lines: 90, functions: 88, branches: 82, statements: 90 },
    },
  },
});
