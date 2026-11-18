// What the pages show: the NEW and SORTED BY PRICE sections, tags and price format.
import { describe, it, expect } from "vitest";
import data from "../../src/data/gifts.json";
import { gifts, allTags, sections, formatPrice, newVisible, priceBands, GRID_COLUMNS } from "../../src/lib/gifts";

describe("gifts", () => {
  it("leaves out drafts", () => {
    expect(gifts.some((g) => g.draft)).toBe(false);
    expect(gifts.length).toBe(data.filter((g) => !g.draft).length);
  });

  it("allTags is sorted and unique, from live gifts only", () => {
    expect(allTags).toEqual([...new Set(gifts.flatMap((g) => g.tags))].sort());
  });
});

describe("sections", () => {
  it("NEW is the newest gifts, enough for the widest grid, newest first", () => {
    const { newest } = sections();
    expect(newest.length).toBe(Math.max(...GRID_COLUMNS.map((n) => newVisible(gifts.length, n))));
    for (let i = 1; i < newest.length; i++) expect((newest[i - 1].date ?? "") >= (newest[i].date ?? "")).toBe(true);
    const cutoff = newest.at(-1)!.date ?? "";
    expect(gifts.filter((g) => (g.date ?? "") > cutoff).every((g) => newest.includes(g))).toBe(true);
  });

  it("SORTED BY PRICE has every gift, most expensive first", () => {
    const { byPrice } = sections();
    expect(byPrice.length).toBe(gifts.length);
    for (let i = 1; i < byPrice.length; i++) expect(byPrice[i - 1].price).toBeGreaterThanOrEqual(byPrice[i].price);
  });

  it.each(allTags)("the %s page only has gifts with that tag", (tag) => {
    const { newest, byPrice } = sections(tag);
    expect(byPrice.length).toBe(gifts.filter((g) => g.tags.includes(tag)).length);
    expect([...newest, ...byPrice].every((g) => g.tags.includes(tag))).toBe(true);
  });

  it("NEW fills whole rows at every column count", () => {
    expect(GRID_COLUMNS.map((n) => newVisible(400, n))).toEqual([9, 12, 10, 12, 14, 16]);
  });

  it("a small tag rounds NEW down to whole rows, or shows one short row", () => {
    expect(newVisible(11, 3)).toBe(9);
    expect(newVisible(11, 7)).toBe(7);
    expect(newVisible(5, 7)).toBe(5);
    expect(newVisible(5, 3)).toBe(3);
    expect(newVisible(0, 4)).toBe(0);
  });

  it("an unknown tag gives empty sections", () => {
    expect(sections("nope")).toEqual({ newest: [], byPrice: [] });
  });

  it("doesn't reorder the shared list", () => {
    const before = gifts.map((g) => g.slug);
    sections();
    sections("live");
    expect(gifts.map((g) => g.slug)).toEqual(before);
  });
});

describe("formatPrice", () => {
  it.each([
    [500, "₹500"],
    [2499, "₹2,499"],
    [100000, "₹1,00,000"],
    [12.6, "₹13"],
  ])("%s → %s", (p, out) => expect(formatPrice(p)).toBe(out));
});

describe("price bands", () => {
  // UNDER ₹500 is a tighter cap inside UNDER ₹1,000; every other band is one slice.
  const slices = priceBands.filter((b) => b.id !== "under-500");

  it("run end to end from ₹0 with no gaps or overlaps, besides the UNDER ₹500 cap", () => {
    expect(slices[0].min).toBe(0);
    expect(slices.at(-1)!.max).toBe(Infinity);
    for (let i = 1; i < slices.length; i++) expect(slices[i].min).toBe(slices[i - 1].max);
  });

  it("put every live gift in exactly one slice", () => {
    for (const g of gifts) expect(slices.filter((b) => g.price >= b.min && g.price < b.max), g.title).toHaveLength(1);
  });

  it("UNDER ₹500 sits inside UNDER ₹1,000 and comes first in the menu", () => {
    const [under500, under1000] = priceBands;
    expect(under500.id).toBe("under-500");
    expect(under500.min).toBe(under1000.min);
    expect(under500.max).toBeLessThan(under1000.max);
  });

  it("have unique ids, safe in a URL", () => {
    expect(new Set(priceBands.map((b) => b.id)).size).toBe(priceBands.length);
    for (const b of priceBands) expect(b.id).toMatch(/^[a-z0-9-]+$/);
  });
});
