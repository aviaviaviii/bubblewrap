// What the pages show: the NEW and SORTED BY PRICE sections, tags and price format.
import { describe, it, expect } from "vitest";
import data from "../../src/data/gifts.json";
import { gifts, allTags, sections, formatPrice } from "../../src/lib/gifts";
import { site } from "../../src/site.config";

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
  it("NEW is the newest gifts, capped at newCount, newest first", () => {
    const { newest } = sections();
    expect(newest.length).toBe(Math.min(site.newCount, gifts.length));
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
