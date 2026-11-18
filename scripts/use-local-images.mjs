// Replaces existing gifts' images from a folder: any file named after a gift's slug
// (thing.png, thing.jpg, …) is encoded as public/images/<slug>.webp through the
// shared encoder, and gifts.json points at it. For new gifts use npm run gift.
// Used to also match Framer image ids; removed with the rest of the Framer tooling.
// Usage: npm run images:local -- ~/Downloads
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { writeGiftImage, OUT } from "./lib/gift-image.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: npm run images:local -- <folder>");
  process.exit(1);
}

const DATA = "src/data/gifts.json";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const files = new Map();
for (const f of readdirSync(dir)) {
  if (IMAGE_EXT.has(extname(f).toLowerCase())) files.set(basename(f, extname(f)), f);
}

const gifts = JSON.parse(readFileSync(DATA, "utf8"));
let written = 0;
for (const g of gifts) {
  const file = files.get(g.slug);
  if (!file) continue;
  g.image = await writeGiftImage(join(dir, file), g.slug);
  written++;
}

writeFileSync(DATA, JSON.stringify(gifts, null, 2) + "\n");
console.log(`wrote ${written} of ${gifts.length} images into ${OUT}/ as webp`);
if (!written) console.log("No file names matched a gift's slug.");
