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
const knownTags = [...new Set(gifts.flatMap((g) => g.tags))].sort();

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

const link = positionals[0] || (await ask("Shop link: "));
if (!/^https?:\/\//.test(link)) fail(`The link should start with http:// or https:// (got "${link}")`);
if (gifts.some((g) => g.link === link)) fail(`Already listed: ${gifts.find((g) => g.link === link).title}`);

const image = (opt.image || (await ask("Image file: "))).replace(/^~(?=\/)/, process.env.HOME).replace(/^['"]|['"]$/g, "");
if (!existsSync(image)) fail(`No image at ${image}`);

const title = opt.title || (await ask("Title: "));
if (!title) fail("A title is needed");

const priceText = opt.price || (await ask("Price in ₹: "));
const price = Number(priceText.replace(/[₹,\s]/g, ""));
if (!Number.isFinite(price) || price <= 0) fail(`The price should be a number (got "${priceText}")`);

const tagsText = opt.tags || (await ask(`Tags, comma separated (${knownTags.join(", ")}): `));
const tags = [...new Set(tagsText.toLowerCase().split(/[\s,]+/).filter(Boolean))];
if (!tags.length) fail("At least one tag is needed");
const newTags = tags.filter((t) => !knownTags.includes(t));

const date = opt.date || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`The date should look like 2026-11-18 (got "${date}")`);
rl?.close();

const slug = title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-");
if (!slug) fail(`Couldn't make a slug from "${title}"`);
if (gifts.some((g) => g.slug === slug)) fail(`A gift with the slug "${slug}" already exists`);

const gift = {
  slug,
  title,
  image: await writeGiftImage(image, slug),
  imageAlt: title,
  price,
  tags,
  date,
  link,
  description: opt.description ?? "",
  draft: opt.draft,
};

writeFileSync(DATA, JSON.stringify([gift, ...gifts], null, 2) + "\n");

console.log(`Added "${title}" · ₹${price.toLocaleString("en-IN")} · ${tags.join(", ")} · ${date}${gift.draft ? " · draft" : ""}`);
console.log(`  image: public${gift.image}`);
if (newTags.length) console.log(`  new tag: ${newTags.join(", ")} gets its own page (/${newTags[0]}); add it to navTags in src/site.config.ts to show it in the menu`);
console.log("Check it with npm run dev, then commit and push.");
