// Confirms the built site sends the vercel.json security headers and that the
// pages they cover load without a Content-Security-Policy break.
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const expected = Object.fromEntries(
  ((JSON.parse(readFileSync("vercel.json", "utf8")).headers ?? []) as { source: string; headers: { key: string; value: string }[] }[])
    .filter((h) => h.source === "/(.*)")
    .flatMap((h) => h.headers.map((x) => [x.key, x.value])),
);

// e2e/serve.mjs speaks HTTP, so it drops upgrade-insecure-requests (see that
// file). The shipped production CSP still includes the directive.
if (!/upgrade-insecure-requests/.test(expected["Content-Security-Policy"] ?? "")) {
  throw new Error("vercel.json CSP must keep upgrade-insecure-requests for production");
}
expected["Content-Security-Policy"] = expected["Content-Security-Policy"]
  .replace(/\s*;\s*upgrade-insecure-requests\b/g, "")
  .replace(/\bupgrade-insecure-requests\s*;\s*/g, "")
  .replace(/;+$/, "");

const HEADER_KEYS = [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
] as const;

// Home, one tag page, the signup success page, and /admin. There is no
// first-party gift detail page; gift cards link out to the shop.
const PAGES = ["/", "/live", "/success", "/admin"] as const;

test.describe("security headers", () => {
  for (const path of PAGES) {
    test(`${path} sends the vercel.json headers and logs no CSP violations`, async ({ page }) => {
      const errors: string[] = [];
      await page.addInitScript(() => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
            `${e.violatedDirective} ${e.blockedURI}`,
          );
        });
      });
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

      const response = await page.goto(path);
      expect(response, path).toBeTruthy();
      expect(response!.ok(), path).toBe(true);
      const headers = response!.headers();
      for (const key of HEADER_KEYS) {
        expect(headers[key.toLowerCase()], `${path} ${key}`).toBe(expected[key]);
      }

      await page.waitForLoadState("networkidle");
      const csp = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
      expect(csp, path).toEqual([]);
      expect(errors.filter((e) => !/Failed to load resource.*404/.test(e)), path).toEqual([]);
    });
  }
});
