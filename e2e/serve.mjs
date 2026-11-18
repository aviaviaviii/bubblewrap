// Serves the built site (.vercel/output/static) the way Vercel does with cleanUrls:
// /live → live/index.html or live.html. Used by Playwright so e2e tests run against
// what actually ships, and because Astro allows only one dev server per project.
// /api/gift isn't served here; the admin tests mock it.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = ".vercel/output/static";
const PORT = Number(process.argv[2] ?? 4391);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".gif": "image/gif", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json" };

const isFile = (p) => stat(p).then((s) => s.isFile(), () => false);

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const base = join(ROOT, path);
  for (const file of [base, join(base, "index.html"), `${base}.html`]) {
    if (await isFile(file)) {
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      return res.end(await readFile(file));
    }
  }
  res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
