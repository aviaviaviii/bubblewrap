// The one place a gift image gets written to public/images/.
// Three scripts feed it (images:import from the PullPage export, images:local
// from a loose folder, images:download from Framer's CDN). They used to write
// files their own way, so running the wrong one put full-size PNGs back next to
// the webp set. Now every route writes the same thing: <slug>.webp, at most
// 800px wide (cards are 220px, so this covers 3x screens), quality 82.
// Webp keeps transparency, and about half the gifts are photos saved as PNG
// that stay 1-2MB even at 800px, which is why the format isn't kept.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp"; // installed with Astro

export const OUT = "public/images";
const MAX_WIDTH = 800;
const QUALITY = 82;

mkdirSync(OUT, { recursive: true });

/** Encode `input` (a file path or Buffer) for `slug`; returns the path for gifts.json. */
export async function writeGiftImage(input, slug) {
  const name = `${slug}.webp`;
  await sharp(input)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(join(OUT, name));
  return `/images/${name}`;
}
