// Security checks over the source tree. Cheap, static, and aimed at the ways this
// particular site could go wrong: XSS in /admin, leaking gift data or secrets into
// static HTML, tabnabbing on shop links, and committed credentials.
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execSync("git ls-files -z", { encoding: "utf8" }).split("\0").filter(Boolean);
const text = tracked.filter((f) => /\.(astro|ts|mjs|js|json|gs|md|css|yml|yaml|html)$/.test(f) && !f.endsWith("package-lock.json"));
const read = (f: string) => readFileSync(f, "utf8");
const source = text.filter((f) => f.startsWith("src/") && !f.startsWith("src/data/"));

describe("no committed secrets", () => {
  const patterns: [string, RegExp][] = [
    ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{40,}/],
    ["private key", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
    ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
    ["Slack token", /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
    ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
    ["Vercel token", /\bvercel_[A-Za-z0-9]{24,}\b/i],
    ["password assignment", /ADMIN_PASSWORD\s*[=:]\s*["'][^"']+["']/],
  ];
  it.each(patterns)("no %s in tracked files", (_name, re) => {
    const hits = text.filter((f) => re.test(read(f)));
    expect(hits).toEqual([]);
  });

  it(".env files are ignored and none are tracked", () => {
    expect(read(".gitignore")).toMatch(/^\.env$/m);
    expect(tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f))).toEqual([]);
  });

  it("raw personal files are never tracked", () => {
    expect(tracked.filter((f) => f.startsWith("xx_raw/"))).toEqual([]);
  });
});

describe("/admin page", () => {
  const admin = read("src/pages/admin.astro");

  it("never builds HTML from strings (no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval)", () => {
    for (const f of source) {
      expect(read(f), f).not.toMatch(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
    }
  });

  it("is noindex", () => {
    expect(admin).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  });

  it("carries no gift data in the page (it's fetched after the password)", () => {
    expect(admin).not.toMatch(/gifts\.json|lib\/gifts/);
  });

  it("keeps the password in sessionStorage, never localStorage", () => {
    expect(admin).toMatch(/sessionStorage\.setItem\(KEY/);
    expect(admin).not.toMatch(/localStorage/);
  });

  it("locking clears the rows and the saved password", () => {
    const lock = admin.slice(admin.indexOf("function lock("), admin.indexOf("function lock(") + 600);
    expect(lock).toMatch(/rows\.replaceChildren\(\)/);
    expect(lock).toMatch(/sessionStorage\.removeItem\(KEY\)/);
  });
});

describe("API route", () => {
  const api = read("src/pages/api/gift.ts");
  it("compares passwords in constant time", () => {
    expect(api).toMatch(/timingSafeEqual/);
    expect(api).not.toMatch(/password\s*===|===\s*expected/);
  });
  it("is the only server-rendered route", () => {
    const dynamic = source.filter((f) => /export const prerender = false/.test(read(f)));
    expect(dynamic).toEqual(["src/pages/api/gift.ts"]);
  });
  it("only talks to api.github.com", () => {
    const urls = api.match(/https?:\/\/[^\s`'"]+/g) ?? [];
    expect(urls.every((u) => u.startsWith("https://api.github.com/"))).toBe(true);
  });
});

describe("outbound links", () => {
  it("every target=_blank link has rel=noopener", () => {
    for (const f of source.filter((f) => f.endsWith(".astro"))) {
      for (const tag of read(f).match(/<a\b[^>]*target="_blank"[^>]*>/g) ?? []) {
        expect(tag, f).toMatch(/rel="[^"]*noopener/);
      }
    }
  });
});

describe("no third-party requests from pages", () => {
  it("fonts are self-hosted (no Google Fonts or other font CDNs)", () => {
    for (const f of source) expect(read(f), f).not.toMatch(/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/);
  });
  it("no external scripts", () => {
    for (const f of source) expect(read(f), f).not.toMatch(/<script[^>]+src="https?:/);
  });
});


describe("security headers", () => {
  it("are declared for every route in vercel.json", () => {
    const cfg = JSON.parse(read("vercel.json"));
    const keys = new Set(
      (cfg.headers ?? []).flatMap((h: { headers: { key: string }[] }) => h.headers.map((x) => x.key)),
    );
    for (const k of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(keys.has(k), k).toBe(true);
    }
  });
});
