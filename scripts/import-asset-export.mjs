// Copies gift images out of a PullPage asset export of the Framer project into
// public/images/ and points src/data/gifts.json at the local copies.
//
// Why this exists alongside download-images.mjs: the export already holds every
// original, so nothing has to be fetched from framerusercontent.com, and it keeps
// working after the Framer project is cancelled.
//
// Images are matched by their original Framer URL (manifest.json → originalUrl),
// not by folder name, because a gift's slug and its export folder can differ.
// Originals run up to ~3200px; cards render at 220px, so anything wider than
// 800px is downscaled (same width download-images.mjs asked Framer for).
// Everything is written as webp. Tried keeping each file's own format first:
// about half the gifts are photos saved as PNG, which stayed 1-2MB each even at
// 800px and left the folder at 64MB. Webp keeps transparency where there is any.
// Safe to re-run: lookup goes by remoteImage, so already-local gifts redo cleanly.
//
// Usage: node scripts/import-asset-export.mjs "xx_raw/bubble-wrap-assets (1)"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp"; // installed with Astro

const exportDir = process.argv[2];
if (!exportDir) {
  console.error('usage: node scripts/import-asset-export.mjs "<export folder>"');
  process.exit(1);
}

const DATA = "src/data/gifts.json";
const OUT = "public/images";
const MAX_WIDTH = 800;
const QUALITY = 82;
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(join(exportDir, "manifest.json"), "utf8"));
const byUrl = new Map(manifest.assets.map((a) => [a.originalUrl.split("?")[0], a]));

const gifts = JSON.parse(readFileSync(DATA, "utf8"));
const seen = new Set();
let written = 0;
const missing = [];

for (const g of gifts) {
  const asset = byUrl.get((g.remoteImage || g.image).split("?")[0]);
  if (!asset) { missing.push(g.slug); continue; }

  const name = `${g.slug}.webp`;
  if (seen.has(name)) throw new Error(`two gifts would share ${name}`);
  seen.add(name);

  await sharp(join(exportDir, asset.file))
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(join(OUT, name));
  written++;
  g.image = `/images/${name}`;
}

writeFileSync(DATA, JSON.stringify(gifts, null, 2) + "\n");
console.log(`images: ${written} written, ${missing.length} missing`);
if (missing.length) console.log("missing:", missing.join(", "));
