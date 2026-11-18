// Guards the gift list itself, since it's edited by hand, by `npm run gift` and by /admin.
// A broken entry here would ship a broken card, so CI stops it.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import data from "../../src/data/gifts.json";
import { slugify } from "../../src/lib/gift-core.mjs";
import { site } from "../../src/site.config";
import { allTags } from "../../src/lib/gifts";

const gifts = data as Record<string, unknown>[];
const KEYS = ["slug", "title", "image", "imageAlt", "price", "tags", "date", "link", "description", "draft"].sort();

describe("gifts.json", () => {
  it("is formatted the way the tools write it (2 spaces, trailing newline)", () => {
    const raw = readFileSync("src/data/gifts.json", "utf8");
    expect(raw).toBe(JSON.stringify(gifts, null, 2) + "\n");
  });

  it("has entries", () => expect(gifts.length).toBeGreaterThan(0));

  it.each(gifts.map((g) => [g.slug, g]))("%s is well formed", (_slug, g) => {
    expect(Object.keys(g).sort()).toEqual(KEYS);
    // Framer-era slugs keep brackets, dots and curly quotes, so this checks the slug is
    // safe as a file name (the image is named after it), not that it's tidy.
    expect(g.slug).toMatch(/^[^\s/\\A-Z]+$/);
    expect(String(g.slug)).not.toMatch(/^\.|\.\./);
    expect(g.image).toBe(`/images/${g.slug}.webp`);
    expect(typeof g.title).toBe("string");
    expect(String(g.title).trim()).toBe(g.title);
    expect(g.title).not.toBe("");
    expect(g.imageAlt).toBeTypeOf("string");
    expect(g.image).toMatch(/^\/images\/[^/]+\.webp$/);
    expect(g.price).toBeTypeOf("number");
    expect(g.price as number).toBeGreaterThan(0);
    expect(Number.isFinite(g.price)).toBe(true);
    expect(Array.isArray(g.tags) && (g.tags as unknown[]).length > 0).toBe(true);
    for (const t of g.tags as string[]) expect(t).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(g.tags as string[]).size).toBe((g.tags as string[]).length);
    if (g.date !== null) {
      expect(g.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(g.date as string))).toBe(false);
    }
    expect(g.link).toMatch(/^https?:\/\/[^\s]+$/);
    expect(() => new URL(g.link as string)).not.toThrow();
    expect(g.draft).toBeTypeOf("boolean");
  });

  it("every image file exists", () => {
    const missing = gifts.filter((g) => !existsSync(`public${g.image}`)).map((g) => g.slug);
    expect(missing).toEqual([]);
  });

  it("slugs are unique", () => {
    const slugs = gifts.map((g) => g.slug);
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([]);
  });

  it("links are unique", () => {
    const links = gifts.map((g) => g.link);
    expect(links.filter((s, i) => links.indexOf(s) !== i)).toEqual([]);
  });

  it("no live gift links over plain http", () => {
    const http = gifts.filter((g) => !g.draft && String(g.link).startsWith("http://")).map((g) => g.slug);
    expect(http).toEqual([]);
  });

  it("no new gift slug collides with an existing one once slugified", () => {
    // makeGift checks slugify(title) against existing slugs; two entries whose titles
    // slugify the same would make that check let a duplicate image name through.
    const fresh = gifts.map((g) => slugify(g.title as string));
    const clashes = fresh.filter((s, i) => s && fresh.indexOf(s) !== i);
    expect(clashes).toEqual([]);
  });
});

describe("site.config", () => {
  it("every nav tag has a page (at least one live gift)", () => {
    for (const t of site.navTags) expect(allTags).toContain(t);
  });

  it("nav tags don't clash with fixed pages", () => {
    const fixed = readdirSync("src/pages").map((f) => f.replace(/\.(astro|ts)$/, ""));
    for (const t of allTags) expect(fixed).not.toContain(t);
  });

  it("links are absolute https", () => {
    expect(site.url).toMatch(/^https:\/\//);
    expect(site.author.href).toMatch(/^https:\/\//);
    expect(site.newsletter.action).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/);
  });

  it("og image and favicon exist", () => {
    expect(existsSync(`public${site.ogImage}`)).toBe(true);
    expect(existsSync(`public${site.favicon}`)).toBe(true);
  });

  it("newMin is a positive whole number", () => {
    expect(Number.isInteger(site.newMin) && site.newMin > 0).toBe(true);
  });
});
