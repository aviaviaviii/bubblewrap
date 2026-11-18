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
