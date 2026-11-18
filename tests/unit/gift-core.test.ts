// The rules every new or edited gift goes through, shared by `npm run gift` and /admin.
import { describe, it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import { slugify, parsePrice, parseTags, today, makeGift, knownTags, encodeGiftImage } from "../../src/lib/gift-core.mjs";
import { sampleGifts, png } from "../helpers/fixtures";

const valid = { title: "Moon Lamp", link: "https://shop.example/moon", price: "₹2,499", tags: "live, play", date: "2026-11-18" };

describe("slugify", () => {
  it.each([
    ["Paper Lamp", "paper-lamp"],
    ["  Spaces   everywhere  ", "spaces-everywhere"],
    ["Biscoff Cheesecake Bites (Buy 3 and get 1 free)", "biscoff-cheesecake-bites-buy-3-and-get-1-free"],
    ["Café Crème", "cafe-creme"],
    ["under_score--and--dash", "under-score-and-dash"],
    ["A/B Test", "ab-test"],
    ["Chef’s kiss", "chefs-kiss"],
  ])("%s → %s", (title, slug) => expect(slugify(title)).toBe(slug));

  it("never produces a path: no slashes, dots or traversal", () => {
    for (const t of ["../../etc/passwd", "..\\..\\windows", "a/../../b", ".hidden", "x.webp"]) {
      expect(slugify(t)).toMatch(/^[a-z0-9-]*$/);
    }
  });

  it("gives an empty slug for titles with no letters or numbers", () => {
    expect(slugify("!!! ???")).toBe("");
  });
});

describe("parsePrice", () => {
  it.each([
    ["2499", 2499],
    ["₹2,499", 2499],
    [" 1 00 000 ", 100000],
    [3200, 3200],
    ["12.50", 12.5],
  ])("%s → %s", (input, out) => expect(parsePrice(input)).toBe(out));

  it("returns NaN for words", () => expect(parsePrice("free")).toBeNaN());
});

describe("parseTags", () => {
  it("lowercases, splits on commas and spaces, and drops duplicates and blanks", () => {
    expect(parseTags("Live, PLAY  live,,read")).toEqual(["live", "play", "read"]);
  });
  it("handles empty input", () => expect(parseTags("")).toEqual([]));
});

describe("today", () => {
  afterEach(() => vi.useRealTimers());
  it("is the UTC date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T23:30:00Z"));
    expect(today()).toBe("2026-11-18");
  });
});

describe("makeGift", () => {
  it("builds the full entry from loose input", () => {
    expect(makeGift(sampleGifts(), valid)).toEqual({
      slug: "moon-lamp",
      title: "Moon Lamp",
      image: "/images/moon-lamp.webp",
      imageAlt: "Moon Lamp",
      price: 2499,
      tags: ["live", "play"],
      date: "2026-11-18",
      link: "https://shop.example/moon",
      description: "",
      draft: false,
    });
  });

  it("accepts arrays and numbers as given", () => {
    const g = makeGift([], { ...valid, price: 100, tags: ["wear"] });
    expect(g.price).toBe(100);
    expect(g.tags).toEqual(["wear"]);
  });

  it("trims the title and link", () => {
    const g = makeGift([], { ...valid, title: "  Moon Lamp ", link: " https://shop.example/moon " });
    expect(g.title).toBe("Moon Lamp");
    expect(g.link).toBe("https://shop.example/moon");
  });

  it("defaults the date to today and keeps draft as a boolean", () => {
    const { date, ...rest } = valid;
    const g = makeGift([], { ...rest, draft: "yes" as unknown as boolean });
    expect(g.date).toBe(today());
    expect(g.draft).toBe(true);
  });

  it.each([
    [{ title: "" }, "A title is needed"],
    [{ title: undefined }, "A title is needed"],
    [{ link: "shop.example/moon" }, "The link should start with http:// or https://"],
    [{ link: "javascript:alert(1)" }, "The link should start with http:// or https://"],
    [{ link: "data:text/html,hi" }, "The link should start with http:// or https://"],
    [{ price: "free" }, "The price should be a number"],
    [{ price: "0" }, "The price should be a number"],
    [{ price: "-10" }, "The price should be a number"],
    [{ price: undefined }, "The price should be a number"],
    [{ tags: "" }, "At least one tag is needed"],
    [{ tags: [] }, "At least one tag is needed"],
    [{ date: "18/11/2026" }, "The date should look like 2026-11-18"],
    [{ title: "???" }, "The title needs at least one letter or number"],
  ])("refuses %o", (over, message) => {
    expect(() => makeGift([], { ...valid, ...over })).toThrow(message);
  });

  it("refuses a link that's already listed, naming the gift", () => {
    expect(() => makeGift(sampleGifts(), { ...valid, link: "https://shop.example/chess" })).toThrow("Already listed: Chess Set");
  });

  it("refuses a title whose slug is taken", () => {
    expect(() => makeGift(sampleGifts(), { ...valid, title: "paper   LAMP" })).toThrow('A gift called "paper   LAMP" already exists');
  });
});

describe("knownTags", () => {
  it("lists every tag once, sorted", () => expect(knownTags(sampleGifts())).toEqual(["live", "play", "wear"]));
});

describe("encodeGiftImage", () => {
  it("makes webp and never enlarges a small image", async () => {
    const out = await encodeGiftImage(await png(40, 30));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(40);
  });

  it("shrinks wide images to 800px and keeps the aspect ratio", async () => {
    const out = await encodeGiftImage(await png(1600, 1200));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it("keeps transparency", async () => {
    const clear = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    expect((await sharp(await encodeGiftImage(clear)).metadata()).hasAlpha).toBe(true);
  });

  it("rejects bytes that aren't an image", async () => {
    await expect(encodeGiftImage(Buffer.from("not an image"))).rejects.toThrow();
  });
});
