// Serves the built site (.vercel/output/static) the way Vercel does with cleanUrls:
// /live → live/index.html or live.html. Used by Playwright so e2e tests run against
// what actually ships, and because Astro allows only one dev server per project.
// /api/gift isn't served here; the admin tests mock it.
// Security headers come from vercel.json (same source as production) and are
// attached to every response whose path matches a rule's source pattern.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = ".vercel/output/static";
const PORT = Number(process.argv[2] ?? 4391);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".gif": "image/gif", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json" };

const headerRules = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).headers ?? [];

// Same source-to-regex mapping as scripts/apply-security-headers.mjs, so the
// local server and the shipped Vercel config agree on which paths get headers.
const sourceRe = (source) => new RegExp(source === "/(.*)" ? "^/(.*)$" : `^${source}$`);

function cspForHttp(value) {
  // This server speaks HTTP. upgrade-insecure-requests would make WebKit
  // fetch local assets over HTTPS, which then fails the TLS handshake.
  // Production is HTTPS, so the shipped CSP keeps the directive.
  return value
    .replace(/\s*;\s*upgrade-insecure-requests\b/g, "")
    .replace(/\bupgrade-insecure-requests\s*;\s*/g, "")
    .replace(/;+$/, "");
}

function securityHeaders(pathname) {
  const headers = {};
  for (const rule of headerRules) {
    if (!sourceRe(rule.source).test(pathname)) continue;
    for (const h of rule.headers) headers[h.key] = h.value;
  }
  if (headers["Content-Security-Policy"]) {
    headers["Content-Security-Policy"] = cspForHttp(headers["Content-Security-Policy"]);
  }
  return headers;
}

const isFile = (p) => stat(p).then((s) => s.isFile(), () => false);

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const base = join(ROOT, path);
  const headers = securityHeaders(path);
  for (const file of [base, join(base, "index.html"), `${base}.html`]) {
    if (await isFile(file)) {
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", ...headers });
      return res.end(await readFile(file));
    }
  }
  res.writeHead(404, { "content-type": "text/plain", ...headers }).end("Not found");
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
