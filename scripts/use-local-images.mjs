// Encodes gift images from a local folder (e.g. ~/Downloads) into public/images/
// (800px webp, via lib/gift-image.mjs) and points src/data/gifts.json at them.
// A file matches a gift if its name (without extension) equals either the
// Framer image id (e.g. mUWGTdVfPfQ0oc9BnsHBxHgnk) or the gift's slug.
// Usage: node scripts/use-local-images.mjs ~/Downloads
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { writeGiftImage, OUT } from "./lib/gift-image.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/use-local-images.mjs <folder>");
  process.exit(1);
}

const DATA = "src/data/gifts.json";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const files = new Map();
for (const f of readdirSync(dir)) {
  const ext = extname(f).toLowerCase();
  if (IMAGE_EXT.has(ext)) files.set(basename(f, extname(f)), f);
}

const gifts = JSON.parse(readFileSync(DATA, "utf8"));
const missing = [];
let copied = 0;

for (const g of gifts) {
  const framerId = basename(new URL(g.remoteImage).pathname).replace(/\.[^.]+$/, "");
  const file = files.get(framerId) ?? files.get(g.slug);
  if (!file) {
    if (g.image.startsWith("http")) missing.push(g.slug);
    continue;
  }
  g.image = await writeGiftImage(join(dir, file), g.slug);
  copied++;
}

writeFileSync(DATA, JSON.stringify(gifts, null, 2) + "\n");
console.log(`wrote ${copied} of ${gifts.length} images into ${OUT}/ as webp`);
if (missing.length) {
  console.log(`${missing.length} gifts still use Framer-hosted images:`);
  console.log("  " + missing.join("\n  "));
  console.log("Run `npm run images:download` to fetch those from Framer.");
}
