import data from "../data/gifts.json";
import { site } from "../site.config";

export type Gift = {
  slug: string;
  title: string;
  image: string;
  imageAlt: string;
  price: number;
  tags: string[];
  date: string | null;
  link: string;
  description: string;
  draft: boolean;
};

export const gifts: Gift[] = (data as Gift[]).filter((g) => !g.draft);

export const allTags = [...new Set(gifts.flatMap((g) => g.tags))].sort();

const byDateDesc = (a: Gift, b: Gift) => (b.date ?? "").localeCompare(a.date ?? "");
const byPriceDesc = (a: Gift, b: Gift) => b.price - a.price;

// Every column count the grid can show: 3 on phones and narrow tablets, then one
// more each time a 220px card and its 24px gap fit, up to 8 (global.css `.grid`).
export const GRID_COLUMNS = [3, 4, 5, 6, 7, 8] as const;

// How many NEW gifts show at a column count. NEW is a teaser, so a ragged last
// row reads as unfinished: it shows the fewest full rows that reach newMin. With
// fewer gifts than that (a small tag), it rounds down to full rows, and with fewer
// than one row it shows them all, centred. SORTED BY PRICE always lists everything.
export function newVisible(total: number, cols: number) {
  const want = Math.ceil(site.newMin / cols) * cols;
  if (total >= want) return want;
  if (total < cols) return total;
  return Math.floor(total / cols) * cols;
}

export function sections(tag?: string) {
  const list = tag ? gifts.filter((g) => g.tags.includes(tag)) : gifts;
  // Render enough for the widest grid; GiftGrid hides the rest per column count.
  const newMax = Math.max(...GRID_COLUMNS.map((n) => newVisible(list.length, n)));
  return {
    newest: [...list].sort(byDateDesc).slice(0, newMax),
    byPrice: [...list].sort(byPriceDesc),
  };
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export const formatPrice = (p: number) => `₹${inr.format(p)}`;

// The price menu on SORTED BY PRICE. Each band runs from min up to, not including,
// max, so a ₹2,500 gift sits in "₹2,500 TO ₹5,000". Cut where the list actually
// splits (Nov 2026, 409 live gifts: 117 · 134 · 92 · 47 · 19), round numbers people
// budget in, and every nav tag has gifts in each band. The id is what ?price= carries.
// UNDER ₹500 (40 gifts) is a tighter cap inside UNDER ₹1,000, not a slice of it, so
// a ₹400 gift is in both; the rest run end to end. Splitting it into ₹500 TO ₹1,000
// was the other option; kept UNDER ₹1,000 as it was asked for unchanged.
export const priceBands = [
  { id: "under-500", label: `UNDER ${formatPrice(500)}`, min: 0, max: 500 },
  { id: "under-1000", label: `UNDER ${formatPrice(1000)}`, min: 0, max: 1000 },
  { id: "1000-2500", label: `${formatPrice(1000)} TO ${formatPrice(2500)}`, min: 1000, max: 2500 },
  { id: "2500-5000", label: `${formatPrice(2500)} TO ${formatPrice(5000)}`, min: 2500, max: 5000 },
  { id: "5000-10000", label: `${formatPrice(5000)} TO ${formatPrice(10000)}`, min: 5000, max: 10000 },
  { id: "over-10000", label: `OVER ${formatPrice(10000)}`, min: 10000, max: Infinity },
] as const;
