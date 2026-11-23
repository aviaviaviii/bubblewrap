// /api/gift, the one server route: password gate, every action, both stores.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { POST } from "../../src/pages/api/gift";
import { adminRequest, fakeGitHub, gift, png, sampleGifts, tempProject } from "../helpers/fixtures";
import { today } from "../../src/lib/gift-core.mjs";
import { FAIL_LIMIT, resetAdminLockout } from "../../src/lib/admin-lockout";

const PASS = "correct horse battery staple";
const call = async (fields: Parameters<typeof adminRequest>[0], file?: Parameters<typeof adminRequest>[1], headers?: HeadersInit) => {
  const res = await POST({ request: adminRequest(fields, file, headers) } as never);
  return { status: res.status, type: res.headers.get("content-type"), retryAfter: res.headers.get("Retry-After"), body: (await res.json()) as Record<string, any> };
};
const withPass = (fields: Record<string, string | string[]> = {}) => ({ password: PASS, ...fields });
const newGift = { title: "Moon Lamp", price: "2499", tags: ["live", "play"], link: "https://shop.example/moon", status: "live", date: "2026-11-18" };

let project: ReturnType<typeof tempProject>;
const cwd = process.cwd();
const readGifts = () => JSON.parse(readFileSync(join(project.dir, "src/data/gifts.json"), "utf8"));

beforeEach(() => {
  project = tempProject();
  process.chdir(project.dir);
  vi.stubEnv("ADMIN_PASSWORD", PASS);
  vi.stubEnv("GITHUB_TOKEN", "");
  delete process.env.GITHUB_TOKEN;
});
afterEach(() => {
  process.chdir(cwd);
  project.cleanup();
  resetAdminLockout();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("password gate", () => {
  it("503 when no password is set up", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    delete process.env.ADMIN_PASSWORD;
    const r = await call(withPass({ action: "list" }));
    expect(r).toMatchObject({ status: 503, body: { error: "The admin password isn't set up yet" } });
  });

  it("401 on a wrong password, after a delay, with no gift data", async () => {
    const t = Date.now();
    const r = await call({ password: "nope", action: "list" });
    expect(Date.now() - t).toBeGreaterThanOrEqual(900);
    expect(r).toEqual({ status: 401, type: "application/json", retryAfter: null, body: { error: "Wrong password" } });
  });

  it("401 when the password is missing", async () => {
    const r = await call({ action: "list" });
    expect(r.status).toBe(401);
  });

  it("401 for a prefix of the real password", async () => {
    expect((await call({ password: PASS.slice(0, -1), action: "list" })).status).toBe(401);
  });

  it("is case sensitive", async () => {
    expect((await call({ password: PASS.toUpperCase(), action: "list" })).status).toBe(401);
  });

  it("ignores whitespace around either side", async () => {
    vi.stubEnv("ADMIN_PASSWORD", `  ${PASS}\n`);
    expect((await call({ password: ` ${PASS} `, action: "list" })).status).toBe(200);
  });

  it("400 on a body that isn't a form", async () => {
    const res = await POST({ request: new Request("http://localhost/api/gift", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }) } as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That didn't come through. Try again" });
  });

  it("checks the password before reading the action", async () => {
    const r = await call({ password: "nope", action: "explode" });
    expect(r.status).toBe(401);
  });
});

describe("password lockout", () => {
  const ip = { "x-real-ip": "203.0.113.10" };
  const other = { "x-real-ip": "203.0.113.11" };
  const fail = () => call({ password: "nope", action: "list" }, undefined, ip);

  it("locks that IP after five wrong passwords, including a later correct one", async () => {
    for (let i = 0; i < FAIL_LIMIT; i++) expect((await fail()).status).toBe(401);
    const locked = await call(withPass({ action: "list" }), undefined, ip);
    expect(locked).toMatchObject({ status: 429, retryAfter: "900", body: { error: "Too many wrong passwords. Try again in 15 minutes" } });
  });

  it("does not lock a different IP", async () => {
    for (let i = 0; i < FAIL_LIMIT; i++) expect((await fail()).status).toBe(401);
    const r = await call(withPass({ action: "list" }), undefined, other);
    expect(r.status).toBe(200);
  });

  it("clears the count after a correct password, so later typos do not inherit it", async () => {
    for (let i = 0; i < FAIL_LIMIT - 1; i++) expect((await fail()).status).toBe(401);
    expect((await call(withPass({ action: "list" }), undefined, ip)).status).toBe(200);
    expect((await fail()).status).toBe(401);
    expect((await call(withPass({ action: "list" }), undefined, ip)).status).toBe(200);
  });

  it("does not delay a correct password when the IP is not locked", async () => {
    const t = Date.now();
    const r = await call(withPass({ action: "list" }), undefined, ip);
    expect(r.status).toBe(200);
    expect(Date.now() - t).toBeLessThan(900);
  });
});

describe("list", () => {
  it("returns every gift, drafts included, newest first, without descriptions", async () => {
    const r = await call(withPass({ action: "list" }));
    expect(r.status).toBe(200);
    expect(r.body.gifts.map((g: any) => g.slug)).toEqual(["paper-lamp", "chess-set", "secret-thing"]);
    expect(Object.keys(r.body.gifts[0]).sort()).toEqual(["date", "draft", "image", "link", "price", "slug", "tags", "title"]);
  });

  it("breaks date ties by title and puts undated gifts last", async () => {
    project.cleanup();
    project = tempProject([gift({ slug: "b", title: "B", date: "2026-01-01" }), gift({ slug: "none", title: "None", date: null }), gift({ slug: "a", title: "A", date: "2026-01-01" })]);
    process.chdir(project.dir);
    const r = await call(withPass({ action: "list" }));
    expect(r.body.gifts.map((g: any) => g.slug)).toEqual(["a", "b", "none"]);
  });

  it("unknown action is a 400", async () => {
    expect(await call(withPass({ action: "drop-table" }))).toMatchObject({ status: 400, body: { error: "Unknown action" } });
  });
});

describe("add (local store)", () => {
  it("adds the gift on top and writes an 800px-max webp named after the slug", async () => {
    const r = await call(withPass({ action: "add", ...newGift }), { name: "moon.png", data: await png(1200, 900) });
    expect(r).toMatchObject({ status: 200, body: { title: "Moon Lamp", slug: "moon-lamp", draft: false, where: "local" } });
    const list = readGifts();
    expect(list[0]).toMatchObject({ slug: "moon-lamp", price: 2499, tags: ["live", "play"], date: "2026-11-18", draft: false });
    expect(list).toHaveLength(4);
    const img = await sharp(join(project.dir, "public/images/moon-lamp.webp")).metadata();
    expect([img.format, img.width]).toEqual(["webp", 800]);
    expect(readFileSync(join(project.dir, "src/data/gifts.json"), "utf8").endsWith("}\n]\n")).toBe(true);
  });

  it("action defaults to add", async () => {
    const r = await call(withPass(newGift), { name: "m.png", data: await png() });
    expect(r.body.slug).toBe("moon-lamp");
  });

  it("an empty date means today; status draft makes a draft", async () => {
    const r = await call(withPass({ action: "add", ...newGift, date: " ", status: "draft" }), { name: "m.png", data: await png() });
    expect(r.body.draft).toBe(true);
    expect(readGifts()[0]).toMatchObject({ date: today(), draft: true });
  });

  it("joins the tag boxes and the new-tag field", async () => {
    await call(withPass({ action: "add", ...newGift, tags: ["live", "Gadgets, desk"] }), { name: "m.png", data: await png() });
    expect(readGifts()[0].tags).toEqual(["live", "gadgets", "desk"]);
  });

  it("needs an image", async () => {
    expect(await call(withPass({ action: "add", ...newGift }))).toMatchObject({ status: 400, body: { error: "Add an image" } });
  });

  it("refuses a file that isn't an image", async () => {
    const r = await call(withPass({ action: "add", ...newGift }), { name: "evil.png", data: Buffer.from("<?php system($_GET[1]); ?>") });
    expect(r).toMatchObject({ status: 400, body: { error: "That file couldn't be read as an image" } });
    expect(readGifts()).toHaveLength(3);
  });

  it("refuses an upload over 4MB before decoding it", async () => {
    const r = await call(withPass({ action: "add", ...newGift }), { name: "big.png", data: Buffer.alloc(4 * 1024 * 1024 + 1) });
    expect(r).toMatchObject({ status: 400, body: { error: "That image is too large. Try a smaller one" } });
  });

  it.each([
    [{ title: "" }, "A title is needed"],
    [{ link: "ftp://x" }, "The link should start with http:// or https://"],
    [{ link: "https://shop.example/chess" }, "Already listed: Chess Set"],
    [{ title: "Paper Lamp", link: "https://shop.example/other" }, 'A gift called "Paper Lamp" already exists'],
    [{ price: "abc" }, "The price should be a number"],
    [{ tags: [] }, "At least one tag is needed"],
  ])("explains what's wrong: %o", async (over, error) => {
    const r = await call(withPass({ action: "add", ...newGift, ...over }), { name: "m.png", data: await png() });
    expect(r).toMatchObject({ status: 400, body: { error } });
    expect(readGifts()).toHaveLength(3);
    expect(existsSync(join(project.dir, "public/images/moon-lamp.webp"))).toBe(false);
  });

  it("a crash is a 500, not a 400", async () => {
    project.cleanup(); // the data file is gone, so reading it fails
    const r = await call(withPass({ action: "list" }));
    expect(r.status).toBe(500);
    project = tempProject();
  });
});

describe("edit (local store)", () => {
  it("changes the fields but never the slug, image path or description", async () => {
    project.cleanup();
    project = tempProject([gift({ description: "kept" }), ...sampleGifts().slice(1)]);
    process.chdir(project.dir);
    const r = await call(withPass({ action: "edit", slug: "paper-lamp", title: "Rice Paper Lamp", price: "3000", tags: ["read"], link: "https://shop.example/rice", status: "draft", date: "2026-01-02" }));
    expect(r).toMatchObject({ status: 200, body: { title: "Rice Paper Lamp", slug: "paper-lamp", draft: true, imageChanged: false } });
    expect(readGifts()[0]).toEqual({ ...gift({ description: "kept" }), title: "Rice Paper Lamp", imageAlt: "Rice Paper Lamp", price: 3000, tags: ["read"], link: "https://shop.example/rice", draft: true, date: "2026-01-02" });
  });

  it("keeps the existing date when none is sent", async () => {
    await call(withPass({ action: "edit", slug: "chess-set", title: "Chess Set", price: "9000", tags: ["play"], link: "https://shop.example/chess", status: "live" }));
    expect(readGifts()[1].date).toBe("2026-10-01");
  });

  it("can keep its own link and title (not a duplicate of itself)", async () => {
    const r = await call(withPass({ action: "edit", slug: "paper-lamp", title: "Paper Lamp", price: "1", tags: ["live"], link: "https://shop.example/paper-lamp", status: "live" }));
    expect(r.status).toBe(200);
  });

  it("replaces the image in place when a new one is sent", async () => {
    const r = await call(withPass({ action: "edit", slug: "paper-lamp", title: "Paper Lamp", price: "1", tags: ["live"], link: "https://shop.example/paper-lamp", status: "live" }), { name: "n.png", data: await png(50, 50) });
    expect(r.body.imageChanged).toBe(true);
    expect(existsSync(join(project.dir, "public/images/paper-lamp.webp"))).toBe(true);
  });

  it("refuses another gift's link", async () => {
    const r = await call(withPass({ action: "edit", slug: "paper-lamp", title: "Paper Lamp", price: "1", tags: ["live"], link: "https://shop.example/chess", status: "live" }));
    expect(r).toMatchObject({ status: 400, body: { error: "Already listed: Chess Set" } });
  });

  it("a gift that's gone is a 400", async () => {
    const r = await call(withPass({ action: "edit", slug: "ghost", title: "G", price: "1", tags: ["live"], link: "https://x.example", status: "live" }));
    expect(r).toMatchObject({ status: 400, body: { error: "That gift isn't in the list anymore" } });
  });
});

describe("publish (local store)", () => {
  it("makes a draft live and dates it today so it shows under NEW", async () => {
    const r = await call(withPass({ action: "publish", slug: "secret-thing" }));
    expect(r).toMatchObject({ status: 200, body: { title: "Secret Thing", slug: "secret-thing", where: "local" } });
    expect(readGifts()[2]).toMatchObject({ draft: false, date: today() });
  });

  it("refuses a gift that's already live", async () => {
    expect(await call(withPass({ action: "publish", slug: "paper-lamp" }))).toMatchObject({ status: 400, body: { error: "Paper Lamp is already published" } });
  });

  it("refuses a missing gift", async () => {
    expect((await call(withPass({ action: "publish", slug: "" }))).status).toBe(400);
  });
});

describe("delete (local store)", () => {
  const image = (slug: string) => join(project.dir, `public/images/${slug}.webp`);
  const putImage = (slug: string) => writeFileSync(image(slug), "webp");

  it("removes the gift and its image, and nothing else", async () => {
    putImage("paper-lamp");
    putImage("chess-set");
    const r = await call(withPass({ action: "delete", slug: "paper-lamp" }));
    expect(r).toMatchObject({ status: 200, body: { title: "Paper Lamp", slug: "paper-lamp", where: "local" } });
    expect(readGifts().map((g: { slug: string }) => g.slug)).toEqual(["chess-set", "secret-thing"]);
    expect(existsSync(image("paper-lamp"))).toBe(false);
    expect(existsSync(image("chess-set"))).toBe(true);
  });

  it("deletes a draft too", async () => {
    const r = await call(withPass({ action: "delete", slug: "secret-thing" }));
    expect(r.status).toBe(200);
    expect(readGifts().some((g: { slug: string }) => g.slug === "secret-thing")).toBe(false);
  });

  it("keeps the image when another gift still uses the same file", async () => {
    project.cleanup();
    project = tempProject([gift(), gift({ slug: "paper-lamp-2", title: "Paper Lamp Two", link: "https://shop.example/paper-lamp-2" })]);
    process.chdir(project.dir);
    putImage("paper-lamp");
    await call(withPass({ action: "delete", slug: "paper-lamp" }));
    expect(readGifts().map((g: { slug: string }) => g.slug)).toEqual(["paper-lamp-2"]);
    expect(existsSync(image("paper-lamp"))).toBe(true);
  });

  it("still succeeds when the image file is already missing", async () => {
    const r = await call(withPass({ action: "delete", slug: "chess-set" }));
    expect(r.status).toBe(200);
  });

  it("a gift that's gone is a 400 and changes nothing", async () => {
    const before = readGifts();
    const r = await call(withPass({ action: "delete", slug: "ghost" }));
    expect(r).toMatchObject({ status: 400, body: { error: "That gift isn't in the list anymore" } });
    expect(readGifts()).toEqual(before);
  });

  it("needs the password", async () => {
    putImage("paper-lamp");
    const r = await call({ password: "nope", action: "delete", slug: "paper-lamp" });
    expect(r.status).toBe(401);
    expect(readGifts()).toHaveLength(3);
    expect(existsSync(image("paper-lamp"))).toBe(true);
  });
});

describe("store choice", () => {
  it("in production without a GitHub token, says so instead of writing files", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    const r = await call(withPass({ action: "list" }));
    expect(r).toMatchObject({ status: 503, body: { error: "The GitHub key isn't set up yet" } });
  });
});

describe("GitHub store", () => {
  const useGitHub = (gh: ReturnType<typeof fakeGitHub>) => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(gh.fetch));
  };

  it("lists from the branch head with the token", async () => {
    const gh = fakeGitHub(sampleGifts());
    useGitHub(gh);
    const r = await call(withPass({ action: "list" }));
    expect(r.body.gifts).toHaveLength(3);
    expect(gh.calls.every((c) => c.auth === "Bearer test-token")).toBe(true);
    expect(gh.calls.every((c) => c.path.startsWith("/repos/aviaviaviii/bubblewrap/"))).toBe(true);
  });

  it("adds a gift and its image as ONE commit", async () => {
    const gh = fakeGitHub(sampleGifts());
    useGitHub(gh);
    const before = gh.commitCount();
    const r = await call(withPass({ action: "add", ...newGift }), { name: "m.png", data: await png() });
    expect(r).toMatchObject({ status: 200, body: { slug: "moon-lamp", where: "github" } });
    expect(r.body.commit).toMatch(/^[0-9a-z]{7}$/);
    expect(gh.commitCount()).toBe(before + 1);
    expect(gh.head().message).toBe("Add gift: Moon Lamp\n\nAdded from /admin.");
    expect(gh.head().files.has("public/images/moon-lamp.webp")).toBe(true);
    expect(gh.gifts()[0].slug).toBe("moon-lamp");
    expect(existsSync(join(project.dir, "public/images/moon-lamp.webp"))).toBe(false); // nothing written locally
  });

  it("deletes a gift and its image as ONE commit", async () => {
    const gh = fakeGitHub(sampleGifts());
    useGitHub(gh);
    // Put the image in the repo first, the way an add would have.
    await call(withPass({ action: "edit", slug: "paper-lamp", title: "Paper Lamp", price: "2499", tags: ["live"], link: "https://shop.example/paper-lamp", status: "live" }), { name: "p.png", data: await png() });
    expect(gh.head().files.has("public/images/paper-lamp.webp")).toBe(true);
    const before = gh.commitCount();
    const r = await call(withPass({ action: "delete", slug: "paper-lamp" }));
    expect(r).toMatchObject({ status: 200, body: { title: "Paper Lamp", where: "github" } });
    expect(gh.commitCount()).toBe(before + 1);
    expect(gh.head().message).toBe("Delete gift: Paper Lamp\n\nDeleted from /admin.");
    expect(gh.head().files.has("public/images/paper-lamp.webp")).toBe(false);
    expect(gh.gifts().map((g: { slug: string }) => g.slug)).toEqual(["chess-set", "secret-thing"]);
  });

  it("never force-pushes", async () => {
    const gh = fakeGitHub(sampleGifts());
    useGitHub(gh);
    await call(withPass({ action: "publish", slug: "secret-thing" }));
    const patch = (fetch as any).mock.calls.find(([, init]: any) => init?.method === "PATCH");
    expect(JSON.parse(patch[1].body).force).toBe(false);
  });

  it("when someone pushes mid-save, redoes the change on top so neither is lost", async () => {
    const gh = fakeGitHub(sampleGifts(), { conflictOnce: true });
    useGitHub(gh);
    const r = await call(withPass({ action: "publish", slug: "secret-thing" }));
    expect(r.status).toBe(200);
    const slugs = gh.gifts().map((g: any) => g.slug);
    expect(slugs).toContain("pushed-from-laptop");
    expect(gh.gifts().find((g: any) => g.slug === "secret-thing").draft).toBe(false);
  });

  it("re-checks the rules against the newer list on retry", async () => {
    const gh = fakeGitHub(sampleGifts(), { conflictOnce: true });
    useGitHub(gh);
    // The laptop push adds a gift whose link is the same as the one being added.
    const r = await call(withPass({ action: "add", ...newGift, title: "Laptop Twin", link: "https://shop.example/laptop" }), { name: "m.png", data: await png() });
    expect(r).toMatchObject({ status: 400, body: { error: "Already listed: Pushed From Laptop" } });
  });

  it.each([401, 403])("a %s from GitHub becomes a plain-language 500", async (status) => {
    const gh = fakeGitHub(sampleGifts(), { status });
    useGitHub(gh);
    const r = await call(withPass({ action: "list" }));
    expect(r).toMatchObject({ status: 500, body: { error: expect.stringContaining("The GitHub key can't reach the repo") } });
    expect(JSON.stringify(r.body)).not.toContain("test-token");
  });

  it("a missing branch reads as a key problem", async () => {
    vi.stubEnv("GITHUB_BRANCH", "nope");
    const gh = fakeGitHub(sampleGifts(), { repo: "someone/else" });
    useGitHub(gh);
    const r = await call(withPass({ action: "list" }));
    expect(r.body.error).toContain("The GitHub key can't reach the repo");
  });

  it("other GitHub errors name the status", async () => {
    const gh = fakeGitHub(sampleGifts(), { status: 502 });
    useGitHub(gh);
    const r = await call(withPass({ action: "list" }));
    expect(r).toMatchObject({ status: 500, body: { error: expect.stringMatching(/GitHub said 502/) } });
  });

  it("uses GITHUB_REPO and GITHUB_BRANCH when set", async () => {
    vi.stubEnv("GITHUB_REPO", "me/fork");
    vi.stubEnv("GITHUB_BRANCH", "staging");
    const gh = fakeGitHub(sampleGifts(), { repo: "me/fork" });
    useGitHub(gh);
    await call(withPass({ action: "list" }));
    expect(gh.calls[0].path).toBe("/repos/me/fork/git/ref/heads/staging");
  });

  it("gives up after a second conflict instead of looping", async () => {
    const gh = fakeGitHub(sampleGifts());
    useGitHub(gh);
    const inner = gh.fetch;
    vi.stubGlobal("fetch", vi.fn(async (u: any, init: any = {}) => (init.method === "PATCH" ? new Response("{}", { status: 422 }) : inner(u, init))));
    const r = await call(withPass({ action: "publish", slug: "secret-thing" }));
    expect(r.status).toBe(500);
    expect((fetch as any).mock.calls.filter(([, i]: any) => i?.method === "PATCH")).toHaveLength(2);
  });
});
