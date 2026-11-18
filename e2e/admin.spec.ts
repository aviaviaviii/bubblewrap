// /admin in a real browser, against a fake /api/gift that behaves like the real one
// (password check, list, add, edit, publish, delete). Nothing touches the real gift list.
import { test, expect, type Page, type Route } from "@playwright/test";
import sharp from "sharp";

const PASS = "open sesame";

type Gift = { slug: string; title: string; image: string; price: number; tags: string[]; date: string | null; link: string; draft: boolean };

const seed = (): Gift[] => [
  { slug: "paper-lamp", title: "Paper Lamp", image: "/images/paper-lamp.webp", price: 2499, tags: ["live"], date: "2026-11-01", link: "https://shop.example/lamp", draft: false },
  { slug: "chess-set", title: "Chess Set", image: "/images/chess-set.webp", price: 9000, tags: ["play"], date: "2026-10-01", link: "https://shop.example/chess", draft: false },
  { slug: "secret-thing", title: "Secret Thing", image: "/images/secret-thing.webp", price: 500, tags: ["wear"], date: "2026-07-01", link: "https://shop.example/secret", draft: true },
];

/** Installs the fake API and returns its state plus every request it saw. */
async function fakeApi(page: Page, opts: { gifts?: Gift[]; failNext?: { action: string; status: number; error: string } } = {}) {
  const state = { gifts: opts.gifts ?? seed(), seen: [] as Record<string, string | string[]>[], failNext: opts.failNext };
  await page.route("**/api/gift", async (route: Route) => {
    const req = route.request();
    const form = await new Response(new Uint8Array(req.postDataBuffer() ?? []), { headers: { "content-type": req.headers()["content-type"] } }).formData();
    const fields: Record<string, any> = {};
    for (const [k, v] of form) fields[k] = typeof v === "string" ? (k in fields ? ([] as string[]).concat(fields[k], v) : v) : `<file ${v.name} ${v.size}>`;
    state.seen.push(fields);
    const reply = (status: number, body: object) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (fields.password !== PASS) return reply(401, { error: "Wrong password" });
    if (state.failNext && state.failNext.action === fields.action) {
      const f = state.failNext;
      state.failNext = undefined;
      return reply(f.status, { error: f.error });
    }
    const tags = form.getAll("tags").join(",").split(/[\s,]+/).filter(Boolean);
    switch (fields.action) {
      case "list":
        return reply(200, { gifts: state.gifts });
      case "publish": {
        const g = state.gifts.find((x) => x.slug === fields.slug)!;
        g.draft = false;
        return reply(200, { title: g.title, slug: g.slug, where: "github" });
      }
      case "add": {
        const slug = String(fields.title).toLowerCase().replace(/\W+/g, "-");
        const g = { slug, title: fields.title, image: `/images/${slug}.webp`, price: Number(fields.price), tags, date: fields.date, link: fields.link, draft: fields.status === "draft" };
        state.gifts.unshift(g);
        return reply(200, { title: g.title, slug, draft: g.draft, where: "github" });
      }
      case "edit": {
        const g = state.gifts.find((x) => x.slug === fields.slug)!;
        Object.assign(g, { title: fields.title, price: Number(fields.price), tags, link: fields.link, draft: fields.status === "draft" });
        return reply(200, { title: g.title, slug: g.slug, draft: g.draft, where: "github" });
      }
      case "delete": {
        const g = state.gifts.find((x) => x.slug === fields.slug);
        if (!g) return reply(400, { error: "That gift isn't in the list anymore" });
        state.gifts = state.gifts.filter((x) => x.slug !== fields.slug);
        return reply(200, { title: g.title, slug: g.slug, where: "github" });
      }
    }
    return reply(400, { error: "Unknown action" });
  });
  return state;
}

async function unlock(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Password").fill(PASS);
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "Gifts" })).toBeVisible();
}

const rows = (page: Page) => page.locator("#rows .row");

test.describe("gate", () => {
  test("shows only the password box at first, and no gift data", async ({ page }) => {
    const api = await fakeApi(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "bubblewrap admin" })).toBeVisible();
    await expect(page.locator("#list-view")).toBeHidden();
    await expect(page.locator("#form-view")).toBeHidden();
    expect(await page.content()).not.toContain("Secret Thing");
    expect(api.seen).toEqual([]);
  });

  test("asks for the password when it's empty, without calling the server", async ({ page }) => {
    const api = await fakeApi(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.locator("#unlock .status")).toHaveText("Still needs the password");
    expect(api.seen).toEqual([]);
  });

  test("Show reveals the password and Hide covers it", async ({ page }) => {
    await page.goto("/admin");
    const input = page.getByLabel("Password");
    await input.fill("abc");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(input).toHaveAttribute("type", "password");
  });

  test("a wrong password says so and stays locked", async ({ page }) => {
    await fakeApi(page);
    await page.goto("/admin");
    await page.getByLabel("Password").fill("guess");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.locator("#unlock .status")).toHaveText("Wrong password");
    await expect(page.locator("#list-view")).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem("bw-admin"))).toBeNull();
  });

  test("an offline network gets a plain message", async ({ page }) => {
    await page.route("**/api/gift", (r) => r.abort("internetdisconnected"));
    await page.goto("/admin");
    await page.getByLabel("Password").fill(PASS);
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.locator("#unlock .status")).toHaveText("Couldn't reach the site. Check your connection and try again");
  });

  test("stays unlocked on reload, and Lock forgets everything", async ({ page }) => {
    await fakeApi(page);
    await unlock(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Gifts" })).toBeVisible();
    await page.getByRole("button", { name: "Lock" }).click();
    await expect(page.locator("#gate")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("bw-admin"))).toBeNull();
    await page.reload();
    await expect(page.locator("#gate")).toBeVisible();
  });

  test("never stores the password in localStorage", async ({ page }) => {
    await fakeApi(page);
    await unlock(page);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(PASS);
  });
});

test.describe("list", () => {
  test("drafts first, then newest, with a count", async ({ page }) => {
    await fakeApi(page);
    await unlock(page);
    await expect(page.locator("#count")).toHaveText("3 gifts · 1 draft");
    await expect(rows(page).locator(".row-link")).toHaveText(["Secret Thing", "Paper Lamp", "Chess Set"]);
    await expect(rows(page).first().locator(".c-status")).toContainText("Draft");
    await expect(rows(page).nth(1).locator(".c-price")).toHaveText("₹2,499");
  });

  test("Publish puts a draft live", async ({ page }) => {
    const api = await fakeApi(page);
    await unlock(page);
    await rows(page).first().getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("#list-status")).toHaveText("Published Secret Thing. On the site in about a minute.");
    await expect(page.locator("#count")).toHaveText("3 gifts");
    expect(api.seen.find((s) => s.action === "publish")).toMatchObject({ slug: "secret-thing", password: PASS });
  });

  test("a failed publish explains and lets them retry", async ({ page }) => {
    await fakeApi(page, { failNext: { action: "publish", status: 500, error: "The GitHub key can't reach the repo" } });
    await unlock(page);
    const btn = rows(page).first().getByRole("button", { name: "Publish" });
    await btn.click();
    await expect(page.locator("#list-status")).toHaveText("The GitHub key can't reach the repo");
    await expect(btn).toBeEnabled();
  });

  test("titles are shown as text, never run as HTML", async ({ page }) => {
    await fakeApi(page, { gifts: [{ ...seed()[0], title: '<img src=x onerror="window.__xss=1">' }] });
    await unlock(page);
    await expect(rows(page).first().locator(".row-link")).toHaveText('<img src=x onerror="window.__xss=1">');
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });

  test("fits a phone with no sideways scroll", async ({ page }) => {
    await fakeApi(page);
    await unlock(page);
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll).toBeLessThanOrEqual(width);
  });
});

test.describe("add", () => {
  test("lists what's missing in one line", async ({ page }) => {
    const api = await fakeApi(page);
    await unlock(page);
    await page.getByRole("link", { name: "Add" }).click();
    await expect(page).toHaveURL(/#new$/);
    await expect(page.getByRole("heading", { name: "Add a gift" })).toBeVisible();
    await page.getByRole("button", { name: "Add gift" }).click();
    await expect(page.locator("#gift .status")).toHaveText("Still needs a title, an image, a price, a tag, a link");
    expect(api.seen.filter((s) => s.action === "add")).toEqual([]);
  });

  test("adds a gift with an image and returns to the list", async ({ page }) => {
    const api = await fakeApi(page);
    await unlock(page);
    await page.getByRole("link", { name: "Add" }).click();
    await page.getByLabel("Title").fill("Moon Lamp");
    const photo = await sharp({ create: { width: 30, height: 30, channels: 3, background: "#c33" } }).png().toBuffer();
    await page.locator("input[name=image]").setInputFiles({ name: "moon.png", mimeType: "image/png", buffer: photo });
    await expect(page.locator("#gift .preview")).toBeVisible();
    await page.getByLabel("Price in ₹").fill("2499");
    await page.locator("#tag-boxes").getByText("live", { exact: true }).click();
    await page.getByLabel("New tag").fill("desk");
    await page.getByLabel("Link").fill("https://shop.example/moon");
    await page.getByRole("button", { name: "Add gift" }).click();
    await expect(page.locator("#list-status")).toHaveText("Added Moon Lamp. On the site in about a minute.");
    await expect(page).not.toHaveURL(/#new/);
    // Drafts stay on top, so the new live gift is first after the one draft.
    await expect(rows(page).locator(".row-link")).toHaveText(["Secret Thing", "Moon Lamp", "Paper Lamp", "Chess Set"]);
    const sent = api.seen.find((s) => s.action === "add")!;
    expect(sent).toMatchObject({ title: "Moon Lamp", price: "2499", link: "https://shop.example/moon", status: "live", image: expect.stringMatching(/^<file moon\.png \d+>$/) });
    expect(sent.tags).toEqual(["live", "desk"]);
  });

  test("a draft says so instead of 'on the site'", async ({ page }) => {
    await fakeApi(page);
    await unlock(page);
    await page.goto("/admin#new");
    await page.getByLabel("Title").fill("Hidden");
    await page.locator("input[name=image]").setInputFiles({ name: "a.png", mimeType: "image/png", buffer: await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } }).png().toBuffer() });
    await page.getByLabel("Price in ₹").fill("1");
    await page.getByLabel("New tag").fill("live");
    await page.getByLabel("Link").fill("https://shop.example/hidden");
    await page.getByText("Draft, hidden from the site").click();
    await page.getByRole("button", { name: "Add gift" }).click();
    await expect(page.locator("#list-status")).toHaveText("Added Hidden as a draft.");
  });

  test("Cancel and the back button return to the list", async ({ page }) => {
    await fakeApi(page);
    await unlock(page);
    await page.getByRole("link", { name: "Add" }).click();
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Gifts" })).toBeVisible();
    await page.getByRole("link", { name: "Add" }).click();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Gifts" })).toBeVisible();
  });
});

test.describe("edit", () => {
  test("clicking a row opens it filled in; saving updates the list", async ({ page }) => {
    const api = await fakeApi(page);
    await unlock(page);
    await rows(page).getByText("Chess Set").click();
    await expect(page).toHaveURL(/#edit\/chess-set$/);
    await expect(page.getByRole("heading", { name: "Edit gift" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Chess Set");
    await expect(page.getByLabel("Price in ₹")).toHaveValue("9000");
    await expect(page.locator("#tag-boxes input[value=play]")).toBeChecked();
    await expect(page.locator("#image-hint")).toBeVisible();
    await page.getByLabel("Price in ₹").fill("9500");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#list-status")).toHaveText("Saved Chess Set. On the site in about a minute.");
    const sent = api.seen.find((s) => s.action === "edit")!;
    expect(sent).toMatchObject({ slug: "chess-set", price: "9500" });
    expect(sent.image).toBeUndefined(); // no new image means none is sent
  });

  test("a deep link to an edit opens it after unlocking", async ({ page }) => {
    await fakeApi(page);
    await page.goto("/admin#edit/paper-lamp");
    await page.getByLabel("Password").fill(PASS);
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByLabel("Title")).toHaveValue("Paper Lamp");
  });

  test("a server refusal is shown on the form and nothing is lost", async ({ page }) => {
    await fakeApi(page, { failNext: { action: "edit", status: 400, error: "Already listed: Paper Lamp" } });
    await unlock(page);
    await rows(page).getByText("Chess Set").click();
    await page.getByLabel("Link").fill("https://shop.example/lamp");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#gift .status")).toHaveText("Already listed: Paper Lamp");
    await expect(page.getByLabel("Link")).toHaveValue("https://shop.example/lamp");
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("a password changed mid-session locks the page", async ({ page }) => {
    await fakeApi(page, { failNext: { action: "edit", status: 401, error: "Wrong password" } });
    await unlock(page);
    await rows(page).getByText("Chess Set").click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#gate")).toBeVisible();
    await expect(page.locator("#unlock .status")).toHaveText("Wrong password. Enter it again");
    await expect(rows(page)).toHaveCount(0);
  });
});

test.describe("delete", () => {
  const deletes = (api: { seen: Record<string, unknown>[] }) => api.seen.filter((s) => s.action === "delete");

  test("only shows on an existing gift, never when adding", async ({ page }) => {
    await fakeApi(page);
    await unlock(page);
    await page.getByRole("link", { name: "Add" }).click();
    await expect(page.getByRole("button", { name: "Delete gift" })).toBeHidden();
    await page.goto("/admin#edit/chess-set");
    await expect(page.getByRole("button", { name: "Delete gift" })).toBeVisible();
  });

  test("asks first; Keep backs out without calling the server", async ({ page }) => {
    const api = await fakeApi(page);
    await unlock(page);
    await rows(page).getByText("Chess Set").click();
    await page.getByRole("button", { name: "Delete gift" }).click();
    await expect(page.locator("#delete-question")).toHaveText("Delete Chess Set? It comes off the site.");
    await expect(page.locator("#delete-no")).toBeFocused(); // the safe choice, Keep, has focus
    await page.locator("#delete-no").click();
    await expect(page.getByRole("button", { name: "Delete gift" })).toBeVisible();
    await expect(page.locator("#delete-confirm")).toBeHidden();
    expect(deletes(api)).toEqual([]);
  });

  test("Delete removes it and returns to the list", async ({ page }) => {
    const api = await fakeApi(page);
    await unlock(page);
    await rows(page).getByText("Chess Set").click();
    await page.getByRole("button", { name: "Delete gift" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("#list-status")).toHaveText("Deleted Chess Set. Off the site in about a minute.");
    await expect(page).not.toHaveURL(/#edit/);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).getByText("Chess Set")).toHaveCount(0);
    expect(deletes(api)).toEqual([expect.objectContaining({ slug: "chess-set" })]);
  });

  test("a failed delete explains, keeps the gift, and lets them retry", async ({ page }) => {
    const api = await fakeApi(page, { failNext: { action: "delete", status: 500, error: "GitHub said 502 on /git/trees" } });
    await unlock(page);
    await rows(page).getByText("Chess Set").click();
    await page.getByRole("button", { name: "Delete gift" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("#delete-status")).toHaveText("GitHub said 502 on /git/trees");
    await expect(page).toHaveURL(/#edit\/chess-set$/);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("#list-status")).toHaveText("Deleted Chess Set. Off the site in about a minute.");
    expect(deletes(api)).toHaveLength(2);
  });

  test("a password changed mid-session locks the page instead of deleting", async ({ page }) => {
    await fakeApi(page, { failNext: { action: "delete", status: 401, error: "Wrong password" } });
    await unlock(page);
    await rows(page).getByText("Chess Set").click();
    await page.getByRole("button", { name: "Delete gift" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("#gate")).toBeVisible();
    await expect(page.locator("#unlock .status")).toHaveText("Wrong password. Enter it again");
  });
});
