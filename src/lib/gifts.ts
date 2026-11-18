import data from "../data/gifts.json";
import { site } from "../site.config";

export type Gift = {
  slug: string;
  title: string;
  image: string;
  remoteImage: string;
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

export function sections(tag?: string) {
  const list = tag ? gifts.filter((g) => g.tags.includes(tag)) : gifts;
  return {
    newest: [...list].sort(byDateDesc).slice(0, site.newCount),
    byPrice: [...list].sort(byPriceDesc),
  };
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export const formatPrice = (p: number) => `₹${inr.format(p)}`;
