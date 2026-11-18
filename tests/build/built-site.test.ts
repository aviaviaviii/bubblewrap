// Checks the real build output (.vercel/output/static), the files that actually ship.
// Run `npm run build` first. Skipped when there's no build, unless REQUIRE_BUILD=1 (CI),
// where a missing build is a failure.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import data from "../../src/data/gifts.json";
import { allTags, gifts, sections } from "../../src/lib/gifts";
import { site } from "../../src/site.config";

const OUT = ".vercel/output/static";
const built = existsSync(join(OUT, "index.html"));
if (process.env.REQUIRE_BUILD && !built) throw new Error(`No build in ${OUT}. Run npm run build first.`);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

// /live may be built as live.html or live/index.html depending on the adapter.
const pageFile = (path: string) => {
  const p = path === "/" ? "" : path.slice(1);
  return [join(OUT, p, "index.html"), join(OUT, `${p}.html`)].find(existsSync);
};
const html = (path: string) => readFileSync(pageFile(path)!, "utf8");
const attrs = (h: string, tag: string, attr: string) =>
  [...h.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]*)"`, "g"))].map((m) => m[1].replace(/&amp;/g, "&"));

const publicPages = ["/", ...allTags.map((t) => `/${t}`), "/success"];
const drafts = (data as any[]).filter((g) => g.draft);

describe.skipIf(!built)("built site", () => {
  it.each([...publicPages, "/admin"])("%s is built", (path) => {
    expect(pageFile(path), path).toBeTruthy();
  });

  it("no pages for tags that only drafts use", () => {
    const draftOnly = [...new Set(drafts.flatMap((g) => g.tags))].filter((t) => !allTags.includes(t));
    for (const t of draftOnly) expect(pageFile(`/${t}`)).toBeFalsy();
  });

  it.each(publicPages)("%s has a title, description, canonical and absolute og:image", (path) => {
    const h = html(path);
    expect(h).toMatch(/<title>[^<]+<\/title>/);
    expect(h).toMatch(/<meta name="description" content="[^"]+"/);
    expect(attrs(h, "link", "href").some((u) => u.startsWith(site.url))).toBe(true);
    expect(h).toMatch(new RegExp(`<meta property="og:image" content="${site.url}/og\\.png"`));
    expect(h).toMatch(/<html lang="en"[\s>]/);
  });

  // Pin the primary domain: the bare one redirects, and a canonical or og:image that
  // redirects costs search ranking and slows link previews.
  it("meta URLs use the www domain", () => {
    expect(site.url).toBe("https://www.bubblewrap.in");
  });

  // Browsers and crawlers ask for /favicon.ico without reading the page.
  it("ships /favicon.ico", () => {
    expect(readFileSync(join(OUT, "favicon.ico")).readUInt16LE(2)).toBe(1);
  });

  it.each(publicPages)("%s links only to pages and files that exist", (path) => {
    const h = html(path);
    const internal = attrs(h, "a", "href").filter((u) => u.startsWith("/"));
    for (const u of internal) expect(pageFile(u.split("#")[0]) ?? (existsSync(join(OUT, u)) || undefined), `${path} → ${u}`).toBeTruthy();
    for (const src of [...attrs(h, "img", "src"), ...attrs(h, "link", "href").filter((u) => u.startsWith("/"))]) {
      if (src.startsWith("/")) expect(existsSync(join(OUT, decodeURI(src))), `${path} → ${src}`).toBe(true);
    }
  });

  it("the home page shows NEW plus every live gift", () => {
    const h = html("/");
    expect(h).toContain(">NEW<");
    expect(h).toContain(">SORTED BY PRICE<");
    const cards = (h.match(/class="card"/g) ?? []).length;
    expect(cards).toBe(sections().newest.length + gifts.length);
  });

  it.each(allTags)("/%s shows only that tag's gifts", (tag) => {
    const links = new Set(attrs(html(`/${tag}`), "a", "href").filter((u) => u.startsWith("http") && u !== site.author.href));
    const expected = new Set(gifts.filter((g) => g.tags.includes(tag)).map((g) => g.link));
    expect([...links].filter((l) => !expected.has(l))).toEqual([]);
  });

  it("no draft shows up anywhere public", () => {
    for (const path of publicPages) {
      const h = html(path);
      for (const d of drafts) {
        expect(h, `${d.slug} on ${path}`).not.toContain(d.link.replace(/&/g, "&amp;"));
      }
    }
  });

  it("/admin ships no gift data", () => {
    const h = html("/admin");
    expect(h).toMatch(/noindex/);
    for (const g of (data as any[]).slice(0, 50)) expect(h).not.toContain(g.link);
    const scripts = attrs(h, "script", "src").filter((s) => s.startsWith("/"));
    for (const s of scripts) {
      const js = readFileSync(join(OUT, s), "utf8");
      for (const g of (data as any[]).slice(0, 50)) expect(js).not.toContain(g.link);
    }
  });

  it("every shop link opens in a new tab without window.opener", () => {
    for (const path of publicPages) {
      for (const tag of html(path).match(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g) ?? []) {
        expect(tag).toMatch(/target="_blank"/);
        expect(tag).toMatch(/rel="[^"]*noopener/);
      }
    }
  });

  it("no secrets or server code in static files", () => {
    for (const f of walk(OUT).filter((f) => /\.(html|js|css|json|txt|map)$/.test(f))) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/ADMIN_PASSWORD|GITHUB_TOKEN|ghp_[A-Za-z0-9]{20}|github_pat_/);
      expect(s, f).not.toMatch(/timingSafeEqual|api\.github\.com/);
    }
  });

  it("no source maps ship", () => {
    expect(walk(OUT).filter((f) => f.endsWith(".map"))).toEqual([]);
  });

  it("the newsletter form posts to the Apps Script with the honeypot in place", () => {
    const h = html("/");
    expect(h).toContain(`action="${site.newsletter.action}"`);
    expect(h).toMatch(/name="website"[^>]*tabindex="-1"|tabindex="-1"[^>]*name="website"/);
  });

  it("the API is a server function, not a static file", () => {
    expect(existsSync(join(OUT, "api/gift"))).toBe(false);
    const fns = readdirSync(".vercel/output/functions", { recursive: true }).map(String);
    expect(fns.some((f) => f.endsWith(".func"))).toBe(true);
  });

  it("vercel.json keeps clean URLs", () => {
    expect(JSON.parse(readFileSync("vercel.json", "utf8"))).toMatchObject({ cleanUrls: true, trailingSlash: false });
  });

  it("pages stay light: no HTML page over 600KB, no image over 1MB", () => {
    for (const path of publicPages) expect(Buffer.byteLength(html(path)), path).toBeLessThan(600 * 1024);
    const big = walk(join(OUT, "images")).filter((f) => statSync(f).size > 1024 * 1024);
    expect(big).toEqual([]);
  });
});
