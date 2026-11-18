// Converts a Framer CMS CSV export into src/data/gifts.json.
// Usage: node scripts/import-framer-csv.mjs path/to/Collection.csv
//
// Re-running is safe: images that were already downloaded locally
// (see scripts/download-images.mjs) are kept for matching slugs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT = "src/data/gifts.json";
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/import-framer-csv.mjs <Collection.csv>");
  process.exit(1);
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

const TAG_FIXES = { lving: "live", living: "live" };

const [header, ...rows] = parseCSV(readFileSync(src, "utf8"));
const col = (name) => header.indexOf(name);

const previous = existsSync(OUT)
  ? new Map(JSON.parse(readFileSync(OUT, "utf8")).map((g) => [g.slug, g]))
  : new Map();

const gifts = rows.map((r) => {
  const slug = r[col("Slug")].trim();
  const remoteImage = r[col("Image")].trim();
  const prev = previous.get(slug);
  const tags = [...new Set(
    r[col("Tag")].toLowerCase().split(/[\s,]+/).filter(Boolean).map((t) => TAG_FIXES[t] ?? t),
  )];
  return {
    slug,
    title: r[col("Title")].trim(),
    image: prev?.remoteImage === remoteImage && prev.image ? prev.image : remoteImage,
    remoteImage,
    imageAlt: r[col("Image:alt")].trim() || r[col("Title")].trim(),
    price: Number(r[col("Price")]) || 0,
    tags,
    date: r[col("Date")].trim() ? r[col("Date")].trim().slice(0, 10) : null,
    link: r[col("Link")].trim(),
    description: r[col("Description")].trim(),
    draft: r[col(":draft")].trim() === "true",
  };
});

writeFileSync(OUT, JSON.stringify(gifts, null, 2) + "\n");
console.log(`wrote ${gifts.length} gifts (${gifts.filter((g) => g.draft).length} drafts) to ${OUT}`);
