// Adds one gift: writes its image as public/images/<slug>.webp (through the shared
// encoder) and puts its entry at the top of src/data/gifts.json, dated today.
//
// Anything not given as a flag is asked for, so the shortest use is:
//   npm run gift -- https://shop.example/products/thing --image ~/Downloads/thing.png
// Everything as flags (nothing asked):
//   npm run gift -- <link> --image <file> --title "Thing" --price 2499 --tags live,play
// Optional: --date 2026-11-18 (default today), --description "...", --draft
//
// Replaces hand-editing gifts.json plus converting the image yourself, and the old
// Framer CSV import (removed), which rebuilt the whole list and dropped hand-added gifts.
// Doesn't read the title or image off the shop page: shops vary too much and it
// would pull files from sites we don't control.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { writeGiftImage } from "./lib/gift-image.mjs";
import { makeGift, knownTags as tagsIn } from "../src/lib/gift-core.mjs";

const DATA = "src/data/gifts.json";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    image: { type: "string" },
    title: { type: "string" },
    price: { type: "string" },
    tags: { type: "string" },
    date: { type: "string" },
    description: { type: "string" },
    draft: { type: "boolean", default: false },
  },
});

const gifts = JSON.parse(readFileSync(DATA, "utf8"));
const knownTags = tagsIn(gifts);

// Reads answers line by line rather than with rl.question(), which drops lines that
// arrive together (pasted or piped answers) and leaves the next prompt hanging.
let rl, lines;
const ask = async (q) => {
  rl ??= createInterface({ input: process.stdin });
  lines ??= rl[Symbol.asyncIterator]();
  process.stdout.write(q);
  const { value, done } = await lines.next();
  if (done) fail("\nStopped before every answer was given");
  if (!process.stdin.isTTY) process.stdout.write(value + "\n");
  return value.trim();
};
const fail = (msg) => { rl?.close(); console.error(msg); process.exit(1); };

// Link and image are checked as soon as they're given, so a duplicate or a typo'd
// path stops before the other questions. Everything else is checked by makeGift,
// the same rules /admin uses.
const link = positionals[0] || (await ask("Shop link: "));
const listed = gifts.find((g) => g.link === link.trim());
if (listed) fail(`Already listed: ${listed.title}`);

// Quotes come off first (a path pasted as '~/Downloads/x.png'), then ~ becomes the home
// folder. The other way round, a quoted ~ path was never expanded and wasn't found.
const image = (opt.image || (await ask("Image file: "))).replace(/^['"]|['"]$/g, "").replace(/^~(?=\/)/, process.env.HOME);
if (!existsSync(image)) fail(`No image at ${image}`);

const title = opt.title || (await ask("Title: "));
const price = opt.price || (await ask("Price in ₹: "));
const tags = opt.tags || (await ask(`Tags, comma separated (${knownTags.join(", ")}): `));
rl?.close();

let gift;
try {
  gift = makeGift(gifts, { title, link, price, tags, date: opt.date, description: opt.description, draft: opt.draft });
} catch (e) {
  fail(e.message);
}
await writeGiftImage(image, gift.slug);
const newTags = gift.tags.filter((t) => !knownTags.includes(t));

writeFileSync(DATA, JSON.stringify([gift, ...gifts], null, 2) + "\n");

console.log(`Added "${gift.title}" · ₹${gift.price.toLocaleString("en-IN")} · ${gift.tags.join(", ")} · ${gift.date}${gift.draft ? " · draft" : ""}`);
console.log(`  image: public${gift.image}`);
if (newTags.length) console.log(`  new tag: ${newTags.join(", ")} gets its own page (/${newTags[0]}); add it to navTags in src/site.config.ts to show it in the menu`);
console.log("Check it with npm run dev, then commit and push.");
