// The public site as a visitor uses it: browse, filter by tag, night mode, sign up.
import { test, expect } from "@playwright/test";
import data from "../src/data/gifts.json" with { type: "json" };

const live = data.filter((g) => !g.draft);
const tags = [...new Set(live.flatMap((g) => g.tags))].sort();
const NEW_COUNT = 12;
const SCRIPT = /script\.google\.com/;
// The one outside service the public pages may call: PostHog analytics, chosen on
// purpose (see Head.astro). Its events go to us.i.posthog.com and its script comes
// from us-assets.i.posthog.com (site.config.ts `posthog.host`); anything else outside
// still fails the check below. Written out here because site.config.ts reads
// import.meta.env, which Playwright's Node runner doesn't provide.
const ANALYTICS = /(^|\.)i\.posthog\.com$/;

test.describe("home", () => {
  test("shows NEW and SORTED BY PRICE with every live gift", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("bubblewrap - gifts that feel like art");
    const sections = page.locator("section.section");
    await expect(sections.nth(0).locator("h2")).toHaveText("NEW");
    await expect(sections.nth(1).locator("h2")).toHaveText("SORTED BY PRICE");
    await expect(sections.nth(0).locator(".card")).toHaveCount(Math.min(NEW_COUNT, live.length));
    await expect(sections.nth(1).locator(".card")).toHaveCount(live.length);
  });

  test("prices are sorted high to low and shown in rupees", async ({ page }) => {
    await page.goto("/");
    const prices = await page.locator("section.section").nth(1).locator(".card-price").allTextContents();
    expect(prices.every((p) => /^₹[\d,]+$/.test(p))).toBe(true);
    const nums = prices.map((p) => Number(p.replace(/[₹,]/g, "")));
    expect(nums).toEqual([...nums].sort((a, b) => b - a));
  });

  test("no draft is shown", async ({ page }) => {
    await page.goto("/");
    const links = await page.locator(".card").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const d of data.filter((g) => g.draft)) expect(links).not.toContain(d.link);
  });

  test("cards open the shop in a new tab, safely, with alt text", async ({ page }) => {
    await page.goto("/");
    const card = page.locator(".card").first();
    await expect(card).toHaveAttribute("target", "_blank");
    await expect(card).toHaveAttribute("rel", /noopener/);
    await expect(card.locator("img")).toHaveAttribute("alt", /.+/);
  });

  test("only the first images load eagerly", async ({ page }) => {
    await page.goto("/");
    const loading = await page.locator(".card img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("loading")));
    expect(loading.slice(0, 10).every((l) => l === "eager")).toBe(true);
    expect(loading.slice(NEW_COUNT).every((l) => l === "lazy")).toBe(true);
  });

  test("makes no third-party requests and logs no errors", async ({ page }) => {
    const errors: string[] = [];
    const outside: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.hostname !== "localhost" && !u.protocol.startsWith("data") && !ANALYTICS.test(u.hostname)) outside.push(r.url());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(outside).toEqual([]);
    expect(errors.filter((e) => !/Failed to load resource.*404/.test(e))).toEqual([]);
  });

  test("fits the screen with no sideways scroll", async ({ page }) => {
    await page.goto("/");
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll).toBeLessThanOrEqual(width);
  });
});

test.describe("tags", () => {
  test("nav marks the current page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "ALL", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goto("/live");
    await expect(page.getByRole("link", { name: "LIVE", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "ALL", exact: true })).not.toHaveAttribute("aria-current", "page");
  });

  test("clicking a nav tag filters the list", async ({ page, isMobile }) => {
    test.skip(isMobile, "nav layout differs on phones; covered by the direct-visit test");
    await page.goto("/");
    await page.getByRole("link", { name: "PLAY", exact: true }).click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.locator("section.section").nth(1).locator(".card")).toHaveCount(live.filter((g) => g.tags.includes("play")).length);
  });

  for (const tag of tags) {
    test(`/${tag} only lists ${tag} gifts`, async ({ page }) => {
      await page.goto(`/${tag}`);
      await expect(page).toHaveTitle(`${tag} · bubblewrap - gifts that feel like art`);
      const links = await page.locator("section.section").nth(1).locator(".card").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      const expected = new Set(live.filter((g) => g.tags.includes(tag)).map((g) => g.link));
      expect(links.length).toBe(expected.size);
      expect(links.every((l) => expected.has(l!))).toBe(true);
    });
  }
});

test.describe("night mode", () => {
  test("toggles and is remembered across pages", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const btn = page.locator("#theme-toggle");
    await expect(btn).toHaveText("NIGHT");
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(btn).toHaveText("DAY");
    await page.goto("/read");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("follows the system setting until chosen", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("#theme-toggle")).toHaveText("DAY");
  });
});

test.describe("newsletter", () => {
  test("a signup posts to the Apps Script and lands on /success", async ({ page }) => {
    let sent: URLSearchParams | null = null;
    await page.route(SCRIPT, async (route) => {
      sent = new URLSearchParams(route.request().postData() ?? "");
      await route.fulfill({ status: 200, body: "ok" });
    });
    await page.goto("/live");
    await page.getByLabel("Email").fill("reader@example.com");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page).toHaveURL(/\/success$/);
    await expect(page.getByText("Thanks love <3")).toBeVisible();
    expect(sent!.get("email")).toBe("reader@example.com");
    expect(sent!.get("page")).toBe("/live");
    expect(sent!.get("website")).toBe("");
  });

  test("an invalid email never leaves the page", async ({ page }) => {
    let calls = 0;
    await page.route(SCRIPT, (r) => (calls++, r.fulfill({ body: "ok" })));
    await page.goto("/");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(calls).toBe(0);
  });

  test("a network failure says Try again and lets them retry", async ({ page }) => {
    await page.route(SCRIPT, (r) => r.abort("internetdisconnected"));
    await page.goto("/");
    await page.getByLabel("Email").fill("reader@example.com");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  test("the success page links home", async ({ page }) => {
    await page.goto("/success");
    await page.getByRole("link", { name: "Woahh! take me back" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
