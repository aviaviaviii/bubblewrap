// Copies gift images from a local folder (e.g. ~/Downloads) into public/images/
// and points src/data/gifts.json at them.
// A file matches a gift if its name (without extension) equals either the
// Framer image id (e.g. mUWGTdVfPfQ0oc9BnsHBxHgnk) or the gift's slug.
// Usage: node scripts/use-local-images.mjs ~/Downloads
import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/use-local-images.mjs <folder>");
  process.exit(1);
}

const DATA = "src/data/gifts.json";
const OUT = "public/images";
mkdirSync(OUT, { recursive: true });

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
  const target = `${g.slug}${extname(file).toLowerCase()}`;
  copyFileSync(join(dir, file), join(OUT, target));
  g.image = `/images/${target}`;
  copied++;
}

writeFileSync(DATA, JSON.stringify(gifts, null, 2) + "\n");
console.log(`copied ${copied} of ${gifts.length} images into ${OUT}/`);
if (missing.length) {
  console.log(`${missing.length} gifts still use Framer-hosted images:`);
  console.log("  " + missing.join("\n  "));
  console.log("Run `npm run images:download` to fetch those from Framer.");
}
