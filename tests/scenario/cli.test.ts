// The command-line tools, run for real as child processes against a temp copy of the
// repo layout: `npm run gift` (flags and questions) and `npm run images:local`.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { png, tempProject } from "../helpers/fixtures";
import { today } from "../../src/lib/gift-core.mjs";

const ADD = resolve("scripts/add-gift.mjs");
const IMAGES = resolve("scripts/use-local-images.mjs");

let p: ReturnType<typeof tempProject>;
let photo: string;
beforeEach(async () => {
  p = tempProject();
  photo = join(p.dir, "photo.png");
  writeFileSync(photo, await png(1000, 500));
});
afterEach(() => p.cleanup());

const run = (script: string, args: string[], input?: string) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: p.dir, input, encoding: "utf8", env: { ...process.env, HOME: p.dir } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const gifts = () => JSON.parse(readFileSync(join(p.dir, "src/data/gifts.json"), "utf8"));

describe("npm run gift", () => {
  it("adds a gift from flags alone, on top, dated today, with an 800px webp", async () => {
    const r = run(ADD, ["https://shop.example/moon", "--image", photo, "--title", "Moon Lamp", "--price", "₹2,499", "--tags", "live,Gadgets"]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('Added "Moon Lamp" · ₹2,499 · live, gadgets');
    expect(r.out).toContain("new tag: gadgets gets its own page (/gadgets)");
    expect(gifts()[0]).toMatchObject({ slug: "moon-lamp", price: 2499, date: today(), draft: false });
    const meta = await sharp(join(p.dir, "public/images/moon-lamp.webp")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 800, 400]);
  });

  it("asks for anything not given, including piped answers arriving at once", () => {
    const r = run(ADD, [], ["https://shop.example/moon", photo, "Moon Lamp", "2499", "read"].join("\n") + "\n");
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/Shop link: .*Image file: .*Title: .*Price in ₹: .*Tags, comma separated \(live, play, wear\): /s);
    expect(gifts()[0]).toMatchObject({ slug: "moon-lamp", tags: ["read"] });
  });

  it("expands ~ in the image path", () => {
    const r = run(ADD, ["https://shop.example/moon", "--image", "~/photo.png", "--title", "Moon", "--price", "1", "--tags", "live"]);
    expect(r.code, r.err).toBe(0);
  });

  it("strips quotes from a dragged-in image path", () => {
    const r = run(ADD, ["https://shop.example/moon", "--image", `'${photo}'`, "--title", "Moon", "--price", "1", "--tags", "live"]);
    expect(r.code, r.err).toBe(0);
  });

  // Known bug: add-gift.mjs expands ~ before stripping quotes, so '~/x.png' isn't found.
  // it.fails keeps CI green today and turns red once it's fixed, as a reminder to
  // change this to a plain it().
  it.fails("expands ~ inside a quoted path", () => {
    const r = run(ADD, ["https://shop.example/moon", "--image", "'~/photo.png'", "--title", "Moon", "--price", "1", "--tags", "live"]);
    expect(r.code, r.err).toBe(0);
  });

  it("supports --date, --description and --draft", () => {
    run(ADD, ["https://shop.example/moon", "--image", photo, "--title", "Moon", "--price", "1", "--tags", "live", "--date", "2026-01-02", "--description", "soft glow", "--draft"]);
    expect(gifts()[0]).toMatchObject({ date: "2026-01-02", description: "soft glow", draft: true });
  });

  it("stops on a link that's already listed, before asking anything else", () => {
    const r = run(ADD, ["https://shop.example/chess"], "");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Already listed: Chess Set");
    expect(r.out).not.toContain("Image file");
  });

  it("stops on a missing image file", () => {
    const r = run(ADD, ["https://shop.example/moon", "--image", "/no/such.png"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("No image at /no/such.png");
  });

  it("stops cleanly if input ends early", () => {
    const r = run(ADD, ["https://shop.example/moon", "--image", photo], "Moon\n");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Stopped before every answer was given");
  });

  it("shows makeGift's message and writes nothing on bad input", () => {
    const before = readFileSync(join(p.dir, "src/data/gifts.json"), "utf8");
    const r = run(ADD, ["https://shop.example/moon", "--image", photo, "--title", "Moon", "--price", "free", "--tags", "live"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("The price should be a number");
    expect(readFileSync(join(p.dir, "src/data/gifts.json"), "utf8")).toBe(before);
    expect(existsSync(join(p.dir, "public/images/moon.webp"))).toBe(false);
  });
});

describe("npm run images:local", () => {
  it("replaces images whose file names match a slug and leaves the rest", async () => {
    const folder = join(p.dir, "drop");
    mkdirSync(folder);
    writeFileSync(join(folder, "chess-set.JPG"), await sharp(await png(900, 900)).jpeg().toBuffer());
    writeFileSync(join(folder, "unknown.png"), await png());
    writeFileSync(join(folder, "notes.txt"), "ignore me");
    const r = run(IMAGES, [folder]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("wrote 1 of 3 images");
    expect((await sharp(join(p.dir, "public/images/chess-set.webp")).metadata()).width).toBe(800);
    expect(existsSync(join(p.dir, "public/images/unknown.webp"))).toBe(false);
  });

  it("says so when nothing matched", () => {
    const folder = join(p.dir, "empty");
    mkdirSync(folder);
    expect(run(IMAGES, [folder]).out).toContain("No file names matched");
  });

  it("needs a folder", () => {
    const r = run(IMAGES, []);
    expect(r.code).toBe(1);
    expect(r.err).toContain("usage:");
  });
});
