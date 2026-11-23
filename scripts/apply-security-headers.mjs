// Copies the security headers from vercel.json into .vercel/output/config.json.
// The Astro Vercel adapter writes the output config itself and only adds
// cache-control for /_astro assets, so a vercel.json `headers` block does not
// end up in what Vercel ships. This runs after `astro build` and inserts the
// rules (with continue: true) just before the filesystem handle, so they apply
// to static pages and to /api/gift.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CONFIG = ".vercel/output/config.json";
const HEADER = "Content-Security-Policy";

if (!existsSync(CONFIG)) {
  console.error(`No ${CONFIG}. Run astro build first.`);
  process.exit(1);
}

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const rules = vercel.headers ?? [];
if (rules.length === 0) {
  console.error("vercel.json has no headers to apply.");
  process.exit(1);
}

const headerRoutes = rules.map((rule) => ({
  src: rule.source === "/(.*)" ? "^/(.*)$" : `^${rule.source}$`,
  headers: Object.fromEntries(rule.headers.map((h) => [h.key, h.value])),
  continue: true,
}));

const out = JSON.parse(readFileSync(CONFIG, "utf8"));
const routes = (out.routes ?? []).filter((r) => !r.headers || !r.headers[HEADER]);
const insertAt = Math.max(0, routes.findIndex((r) => r.handle === "filesystem"));
const at = routes.some((r) => r.handle === "filesystem") ? insertAt : 0;
out.routes = [...routes.slice(0, at), ...headerRoutes, ...routes.slice(at)];
writeFileSync(CONFIG, JSON.stringify(out) + "\n");
