// The public site as a visitor uses it: browse, filter by tag, night mode, sign up.
import { test, expect } from "@playwright/test";
import data from "../src/data/gifts.json" with { type: "json" };

const live = data.filter((g) => !g.draft);
const tags = [...new Set(live.flatMap((g) => g.tags))].sort();
// NEW renders 16 (enough for 8 columns) and CSS shows only full rows; see below.
const NEW_COUNT = 16;
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

  // Columns follow the width up to an 8-column cap (global.css `.grid`), so
  // tablets and wide monitors fill the screen instead of stopping at 3 or 5.
  // NEW then shows only full rows: the fewest that reach 9 gifts.
  const COLUMNS: [number, number, number][] = [
    [820, 3, 9], [1024, 4, 12], [1180, 4, 12], [1366, 5, 10], [1512, 6, 12], [1788, 7, 14], [1920, 7, 14], [2560, 8, 16],
  ];
  for (const [width, cols, shown] of COLUMNS) {
    test(`shows ${cols} columns and ${shown} NEW gifts in full rows at ${width}px`, async ({ page, isMobile }) => {
      test.skip(isMobile, "phone widths keep their own 3-column grid");
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const tops = await page.locator("section.section").first().locator(".grid > li")
        .evaluateAll((lis) => lis.filter((li) => li.getClientRects().length).map((li) => Math.round(li.getBoundingClientRect().top)));
      expect(tops.filter((t) => t === tops[0])).toHaveLength(cols);
      expect(tops).toHaveLength(shown);
    });
  }

  test("NEW shows 9 gifts in 3 full rows on a phone", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone only");
    await page.goto("/");
    await expect(page.locator("section.section").first().locator(".grid > li:visible")).toHaveCount(9);
  });
});

test.describe("price filter", () => {
  const priced = (lo: number, hi: number) => live.filter((g) => g.price >= lo && g.price < hi).length;

  test("narrows SORTED BY PRICE to one band, low to high, and leaves NEW alone", async ({ page }) => {
    await page.goto("/");
    const sorted = page.locator("section.section").nth(1);
    const menu = sorted.getByLabel("Price");
    const shownPrices = async () =>
      (await sorted.locator(".card:visible .card-price").allTextContents()).map((p) => Number(p.replace(/[₹,]/g, "")));
    await expect(menu).toHaveValue("");
    await menu.selectOption("1000-2500");
    await expect(page).toHaveURL(/\?price=1000-2500$/);
    await expect(sorted.locator(".card:visible")).toHaveCount(priced(1000, 2500));
    const band = await shownPrices();
    expect(band.every((p) => p >= 1000 && p < 2500)).toBe(true);
    expect(band).toEqual([...band].sort((a, b) => a - b));
    await expect(page.locator("section.section").nth(0).locator(".card")).toHaveCount(Math.min(NEW_COUNT, live.length));
    await menu.selectOption("");
    await expect(page).toHaveURL(/\/$/);
    await expect(sorted.locator(".card:visible")).toHaveCount(live.length);
    const all = await shownPrices();
    expect(all).toEqual([...all].sort((a, b) => b - a));
  });

  test("a shared ?price= link opens filtered, on tag pages too", async ({ page }) => {
    await page.goto("/read?price=over-10000");
    const sorted = page.locator("section.section").nth(1);
    await expect(sorted.getByLabel("Price")).toHaveValue("over-10000");
    await expect(sorted.locator(".card:visible")).toHaveCount(live.filter((g) => g.tags.includes("read") && g.price >= 10000).length);
  });

  test("UNDER ₹500 shows only gifts under ₹500, low to high", async ({ page }) => {
    await page.goto("/?price=under-500");
    const sorted = page.locator("section.section").nth(1);
    await expect(sorted.getByLabel("Price")).toHaveValue("under-500");
    await expect(sorted.locator(".card:visible")).toHaveCount(priced(0, 500));
    const prices = (await sorted.locator(".card:visible .card-price").allTextContents()).map((p) => Number(p.replace(/[₹,]/g, "")));
    expect(prices.every((p) => p < 500)).toBe(true);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test("an unknown ?price= shows everything", async ({ page }) => {
    await page.goto("/?price=free");
    await expect(page.locator("section.section").nth(1).locator(".card:visible")).toHaveCount(live.length);
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
  // The theme follows the visitor's local clock (day 7:00 to 19:00); a tap holds until
  // the next switch. Dates have no offset, so they read as the browser's local time.
  test("is day in the daytime and night at night", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-18T10:00:00"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("#theme-toggle")).toHaveText("NIGHT");

    await page.clock.setFixedTime(new Date("2026-11-18T21:00:00"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#theme-toggle")).toHaveText("DAY");
  });

  test("ignores the system setting", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.clock.setFixedTime(new Date("2026-11-18T10:00:00"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("a tap is remembered across pages until the next switch", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-18T10:00:00"));
    await page.goto("/");
    const btn = page.locator("#theme-toggle");
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(btn).toHaveText("DAY");
    await page.goto("/read");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // After 19:00 the tap has expired and the clock decides again (night).
    await page.clock.setFixedTime(new Date("2026-11-18T19:30:00"));
    await page.goto("/");
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // The next morning the clock takes over again.
    await page.clock.setFixedTime(new Date("2026-11-19T08:00:00"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.clock.setFixedTime(new Date("2026-11-19T20:00:00"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
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
