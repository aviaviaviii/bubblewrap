// Shared test fixtures: a tiny real image, a sample gift list, a temp project folder
// shaped like this repo (src/data + public/images) and a fake GitHub API.
import sharp from "sharp";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const png = (width = 40, height = 30) =>
  sharp({ create: { width, height, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();

export const gift = (over: Record<string, unknown> = {}) => ({
  slug: "paper-lamp",
  title: "Paper Lamp",
  image: "/images/paper-lamp.webp",
  imageAlt: "Paper Lamp",
  price: 2499,
  tags: ["live"],
  date: "2026-11-01",
  link: "https://shop.example/paper-lamp",
  description: "",
  draft: false,
  ...over,
});

export const sampleGifts = () => [
  gift(),
  gift({ slug: "chess-set", title: "Chess Set", image: "/images/chess-set.webp", imageAlt: "Chess Set", price: 9000, tags: ["play"], date: "2026-10-01", link: "https://shop.example/chess" }),
  gift({ slug: "secret-thing", title: "Secret Thing", image: "/images/secret-thing.webp", imageAlt: "Secret Thing", price: 500, tags: ["wear"], date: "2026-09-01", link: "https://shop.example/secret", draft: true }),
];

/** A throwaway folder laid out like the repo, for code that reads relative paths. */
export function tempProject(gifts = sampleGifts()) {
  const dir = mkdtempSync(join(tmpdir(), "bubblewrap-test-"));
  mkdirSync(join(dir, "src/data"), { recursive: true });
  mkdirSync(join(dir, "public/images"), { recursive: true });
  writeFileSync(join(dir, "src/data/gifts.json"), JSON.stringify(gifts, null, 2) + "\n");
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Builds the multipart request /admin sends. */
export function adminRequest(fields: Record<string, string | string[] | Blob>, file?: { name: string; data: Buffer; type?: string }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.set(k, v);
  }
  if (file) fd.set("image", new File([new Uint8Array(file.data)], file.name, { type: file.type ?? "image/png" }));
  return new Request("http://localhost/api/gift", { method: "POST", body: fd });
}

/**
 * Just enough of GitHub's git data API for the admin's GitHub store:
 * ref → commit → tree, blobs, contents (raw), and moving the branch.
 * `conflictOnce` makes the first ref update fail with 422, as when someone pushes mid-save.
 */
export function fakeGitHub(initialGifts: unknown[], opts: { conflictOnce?: boolean; status?: number; repo?: string } = {}) {
  const repo = opts.repo ?? "aviaviaviii/bubblewrap";
  let n = 0;
  const id = (p: string) => `${p}${++n}`.padEnd(40, "0");
  const files = new Map<string, string>([["src/data/gifts.json", JSON.stringify(initialGifts, null, 2) + "\n"]]);
  const blobs = new Map<string, string>();
  let head = id("c");
  const commits = new Map<string, { tree: string; message?: string; parents?: string[]; files: Map<string, string> }>([[head, { tree: id("t"), files: new Map(files) }]]);
  const trees = new Map<string, Map<string, string>>();
  let conflict = Boolean(opts.conflictOnce);
  const calls: { method: string; path: string; auth: string | null }[] = [];

  const res = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    calls.push({ method, path: url.pathname + url.search, auth: headers.get("authorization") });
    if (opts.status) return res(opts.status, { message: "nope" });
    const prefix = `/repos/${repo}`;
    if (!url.pathname.startsWith(prefix)) return res(404, { message: "Not Found" });
    const path = url.pathname.slice(prefix.length);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;

    if (method === "GET" && path.startsWith("/git/ref/heads/")) return res(200, { object: { sha: head } });
    if (method === "GET" && path.startsWith("/contents/")) {
      const file = path.slice("/contents/".length);
      const ref = url.searchParams.get("ref") ?? head;
      const content = commits.get(ref)?.files.get(file);
      return content === undefined ? res(404, { message: "Not Found" }) : res(200, content);
    }
    if (method === "GET" && path.startsWith("/git/commits/")) {
      const c = commits.get(path.slice("/git/commits/".length));
      return c ? res(200, { sha: path.slice(13), tree: { sha: c.tree } }) : res(404, {});
    }
    if (method === "POST" && path === "/git/blobs") {
      const sha = id("b");
      blobs.set(sha, body.encoding === "base64" ? Buffer.from(body.content, "base64").toString("latin1") : body.content);
      return res(201, { sha });
    }
    if (method === "POST" && path === "/git/trees") {
      const sha = id("t");
      trees.set(sha, new Map(body.tree.map((e: { path: string; sha: string }) => [e.path, e.sha])));
      return res(201, { sha });
    }
    if (method === "POST" && path === "/git/commits") {
      const sha = id("c");
      const base = commits.get(body.parents[0])!.files;
      const next = new Map(base);
      // Like GitHub: a tree entry with sha null removes that file (how delete drops the image).
      for (const [p, b] of trees.get(body.tree)!) b === null ? next.delete(p) : next.set(p, blobs.get(b)!);
      commits.set(sha, { tree: body.tree, message: body.message, parents: body.parents, files: next });
      return res(201, { sha });
    }
    if (method === "PATCH" && path.startsWith("/git/refs/heads/")) {
      if (conflict) {
        conflict = false;
        // Someone else's commit lands first, adding a gift of their own.
        const theirs = id("c");
        const list = JSON.parse(commits.get(head)!.files.get("src/data/gifts.json")!);
        const files2 = new Map(commits.get(head)!.files);
        files2.set("src/data/gifts.json", JSON.stringify([{ ...list[0], slug: "pushed-from-laptop", title: "Pushed From Laptop", link: "https://shop.example/laptop" }, ...list], null, 2));
        commits.set(theirs, { tree: id("t"), files: files2, parents: [head] });
        head = theirs;
        return res(422, { message: "Update is not a fast forward" });
      }
      if (body.force) return res(400, { message: "force not expected" });
      if (commits.get(body.sha)?.parents?.[0] !== head) return res(422, { message: "Update is not a fast forward" });
      head = body.sha;
      return res(200, { object: { sha: head } });
    }
    return res(404, { message: `unhandled ${method} ${path}` });
  };

  return {
    fetch,
    calls,
    head: () => commits.get(head)!,
    gifts: () => JSON.parse(commits.get(head)!.files.get("src/data/gifts.json")!),
    commitCount: () => commits.size,
  };
}
