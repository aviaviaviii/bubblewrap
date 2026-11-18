// Downloads every gift image from framerusercontent.com into public/images/
// (800px webp, via lib/gift-image.mjs)
// and points src/data/gifts.json at the local copies, so the site no longer
// depends on Framer once the old project is cancelled.
// Usage: node scripts/download-images.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { writeGiftImage } from "./lib/gift-image.mjs";

const DATA = "src/data/gifts.json";

const gifts = JSON.parse(readFileSync(DATA, "utf8"));
let done = 0, failed = 0;

async function fetchOne(g) {
  if (!g.image.startsWith("http")) return;
  // Framer serves resized variants; ask for 800px and let gift-image.mjs make the webp.
  const res = await fetch(`${g.image}?width=800`);
  if (!res.ok) throw new Error(`${res.status} ${g.image}`);
  g.image = await writeGiftImage(Buffer.from(await res.arrayBuffer()), g.slug);
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
