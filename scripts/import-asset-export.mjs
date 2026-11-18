// Copies gift images out of a PullPage asset export of the Framer project into
// public/images/ and points src/data/gifts.json at the local copies.
//
// Why this exists alongside download-images.mjs: the export already holds every
// original, so nothing has to be fetched from framerusercontent.com, and it keeps
// working after the Framer project is cancelled.
//
// Images are matched by their original Framer URL (manifest.json → originalUrl),
// not by folder name, because a gift's slug and its export folder can differ.
// Encoding (800px webp) lives in lib/gift-image.mjs, shared with the other image scripts.
// Safe to re-run: lookup goes by remoteImage, so already-local gifts redo cleanly.
//
// Usage: npm run images:import -- "xx_raw/bubble-wrap-assets (2)"
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeGiftImage } from "./lib/gift-image.mjs";

const exportDir = process.argv[2];
if (!exportDir) {
  console.error('usage: node scripts/import-asset-export.mjs "<export folder>"');
  process.exit(1);
}

const DATA = "src/data/gifts.json";

const manifest = JSON.parse(readFileSync(join(exportDir, "manifest.json"), "utf8"));
const byUrl = new Map(manifest.assets.map((a) => [a.originalUrl.split("?")[0], a]));

const gifts = JSON.parse(readFileSync(DATA, "utf8"));
const seen = new Set();
let written = 0;
const missing = [];

for (const g of gifts) {
  const asset = byUrl.get((g.remoteImage || g.image).split("?")[0]);
  if (!asset) { missing.push(g.slug); continue; }

  if (seen.has(g.slug)) throw new Error(`two gifts share the slug ${g.slug}`);
  seen.add(g.slug);

  g.image = await writeGiftImage(join(exportDir, asset.file), g.slug);
  written++;
}

writeFileSync(DATA, JSON.stringify(gifts, null, 2) + "\n");
console.log(`images: ${written} written, ${missing.length} missing`);
if (missing.length) console.log("missing:", missing.join(", "));
