// End-to-end story through the API, the way the person uses /admin over a week:
// add a draft, fix a typo, swap the photo, publish, then check what the site would show.
// Runs against both stores so local dev and production behave the same.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST } from "../../src/pages/api/gift";
import { adminRequest, fakeGitHub, png, sampleGifts, tempProject } from "../helpers/fixtures";
import { today } from "../../src/lib/gift-core.mjs";

const PASS = "pw";
const call = async (fields: Record<string, string | string[]>, file?: Buffer) => {
  const res = await POST({ request: adminRequest({ password: PASS, ...fields }, file && { name: "p.png", data: file }) } as never);
  return { status: res.status, body: (await res.json()) as any };
};

let p: ReturnType<typeof tempProject>;
const cwd = process.cwd();
beforeEach(() => {
  p = tempProject();
  process.chdir(p.dir);
  vi.stubEnv("ADMIN_PASSWORD", PASS);
  delete process.env.GITHUB_TOKEN;
});
afterEach(() => {
  process.chdir(cwd);
  p.cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const story = async (readList: () => any[]) => {
  // 1. Add as a draft
  const added = await call({ action: "add", title: "Moon Lamp", price: "2499", tags: ["live"], link: "https://shop.example/moon", status: "draft", date: "2026-11-01" }, await png());
  expect(added).toMatchObject({ status: 200, body: { draft: true } });

  // 2. It's in the admin list at the top, still a draft
  const list1 = (await call({ action: "list" })).body.gifts;
  expect(list1[0]).toMatchObject({ slug: "moon-lamp", draft: true });

  // 3. Fix a typo in the title and the price, keep it a draft
  const edited = await call({ action: "edit", slug: "moon-lamp", title: "Moon Lamp (Large)", price: "2,999", tags: ["live", "read"], link: "https://shop.example/moon", status: "draft", date: "2026-11-01" });
  expect(edited.body).toMatchObject({ slug: "moon-lamp", title: "Moon Lamp (Large)", draft: true });

  // 4. Swap the photo
  const swapped = await call({ action: "edit", slug: "moon-lamp", title: "Moon Lamp (Large)", price: "2999", tags: ["live", "read"], link: "https://shop.example/moon", status: "draft" }, await png(60, 60));
  expect(swapped.body.imageChanged).toBe(true);

  // 5. Publish from the list
  expect((await call({ action: "publish", slug: "moon-lamp" })).status).toBe(200);
  // 6. Publishing twice is refused
  expect((await call({ action: "publish", slug: "moon-lamp" })).status).toBe(400);

  const final = readList().find((g: any) => g.slug === "moon-lamp");
  expect(final).toEqual({
    slug: "moon-lamp",
    title: "Moon Lamp (Large)",
    image: "/images/moon-lamp.webp",
    imageAlt: "Moon Lamp (Large)",
    price: 2999,
    tags: ["live", "read"],
    date: today(),
    link: "https://shop.example/moon",
    description: "",
    draft: false,
  });
  expect(readList()).toHaveLength(4);
};

describe("a gift's life in /admin", () => {
  it("local store (npm run dev)", async () => {
    await story(() => JSON.parse(readFileSync(join(p.dir, "src/data/gifts.json"), "utf8")));
  });

  it("GitHub store (production): one commit per save", async () => {
    const gh = fakeGitHub(sampleGifts());
    vi.stubEnv("GITHUB_TOKEN", "t");
    vi.stubGlobal("fetch", gh.fetch);
    const before = gh.commitCount();
    await story(() => gh.gifts());
    expect(gh.commitCount() - before).toBe(4); // add, edit, edit, publish; the refused publish made none
    expect(gh.head().message).toMatch(/^Publish gift: Moon Lamp \(Large\)/);
  });

  it("a wrong password partway through changes nothing", async () => {
    await call({ action: "add", title: "Moon", price: "1", tags: ["live"], link: "https://shop.example/moon", status: "live" }, await png());
    const before = readFileSync(join(p.dir, "src/data/gifts.json"), "utf8");
    const res = await POST({ request: adminRequest({ password: "stale", action: "edit", slug: "moon", title: "Hacked", price: "1", tags: ["live"], link: "https://evil.example", status: "live" }) } as never);
    expect(res.status).toBe(401);
    expect(readFileSync(join(p.dir, "src/data/gifts.json"), "utf8")).toBe(before);
  });
});
