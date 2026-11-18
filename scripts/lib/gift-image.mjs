// Writes a gift image to public/images/<slug>.webp. The encoding itself lives in
// src/lib/gift-core.mjs, shared with the /admin page, so every route (npm run gift,
// npm run images:local, /admin) produces the same file.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeGiftImage } from "../../src/lib/gift-core.mjs";

export const OUT = "public/images";

/** Encode `input` (a file path or Buffer) for `slug`; returns the path for gifts.json. */
export async function writeGiftImage(input, slug) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${slug}.webp`), await encodeGiftImage(input));
  return `/images/${slug}.webp`;
}
