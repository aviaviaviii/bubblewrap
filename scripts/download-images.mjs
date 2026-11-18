// Downloads every gift image from framerusercontent.com into public/images/
// and points src/data/gifts.json at the local copies, so the site no longer
// depends on Framer once the old project is cancelled.
// Usage: node scripts/download-images.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { extname } from "node:path";

const DATA = "src/data/gifts.json";
const DIR = "public/images";
mkdirSync(DIR, { recursive: true });

const gifts = JSON.parse(readFileSync(DATA, "utf8"));
let done = 0, failed = 0;

async function fetchOne(g) {
  if (!g.image.startsWith("http")) return;
  const ext = extname(new URL(g.image).pathname) || ".jpg";
  const file = `${g.slug}${ext}`;
  if (!existsSync(`${DIR}/${file}`)) {
    // Framer serves resized variants; 800px wide is plenty for 220px cards at 3x.
    const res = await fetch(`${g.image}?width=800`);
    if (!res.ok) throw new Error(`${res.status} ${g.image}`);
    writeFileSync(`${DIR}/${file}`, Buffer.from(await res.arrayBuffer()));
  }
  g.image = `/images/${file}`;
}

const queue = [...gifts];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const g = queue.shift();
    try { await fetchOne(g); done++; }
    catch (e) { failed++; console.error("failed:", g.slug, e.message); }
  }
}));

writeFileSync(DATA, JSON.stringify(gifts, null, 2) + "\n");
console.log(`images: ${done} ok, ${failed} failed`);
