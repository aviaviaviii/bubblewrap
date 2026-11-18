// What a new gift is and how its image is made, shared by the two ways of adding
// one: `npm run gift` (scripts/add-gift.mjs) and the /admin page (src/pages/api/gift.ts).
// Kept in one place so a gift added either way comes out identical.
// Plain JS (not TS) so the Node scripts can import it without a build step.
import sharp from "sharp";

// Cards are 220px wide, so 800px covers 3x screens. Webp keeps transparency;
// about half the gifts are photos saved as PNG, which stay 1-2MB at 800px.
const MAX_WIDTH = 800;
const QUALITY = 82;

/** Encode any image sharp can read (path or Buffer) to the site's webp. */
export function encodeGiftImage(input) {
  return sharp(input).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
}

export const slugify = (title) =>
  title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-");

export const parsePrice = (text) => Number(String(text).replace(/[₹,\s]/g, ""));

export const parseTags = (text) => [...new Set(String(text).toLowerCase().split(/[\s,]+/).filter(Boolean))];

export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Checks the input against the existing list and returns the new gift entry.
 * Throws an Error whose message is fit to show the person adding the gift.
 */
export function makeGift(gifts, { title, link, price, tags, date = today(), description = "", draft = false }) {
  title = String(title ?? "").trim();
  link = String(link ?? "").trim();
  if (!title) throw new Error("A title is needed");
  if (!/^https?:\/\//.test(link)) throw new Error("The link should start with http:// or https://");
  const listed = gifts.find((g) => g.link === link);
  if (listed) throw new Error(`Already listed: ${listed.title}`);

  const priceNum = typeof price === "number" ? price : parsePrice(price ?? "");
  if (!Number.isFinite(priceNum) || priceNum <= 0) throw new Error("The price should be a number");

  const tagList = Array.isArray(tags) ? tags : parseTags(tags ?? "");
  if (!tagList.length) throw new Error("At least one tag is needed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("The date should look like 2026-11-18");

  const slug = slugify(title);
  if (!slug) throw new Error("The title needs at least one letter or number");
  if (gifts.some((g) => g.slug === slug)) throw new Error(`A gift called "${title}" already exists`);

  return {
    slug,
    title,
    image: `/images/${slug}.webp`,
    imageAlt: title,
    price: priceNum,
    tags: tagList,
    date,
    link,
    description,
    draft: Boolean(draft),
  };
}

/** Tags used anywhere in the list, for hints and for spotting a new one. */
export const knownTags = (gifts) => [...new Set(gifts.flatMap((g) => g.tags))].sort();
