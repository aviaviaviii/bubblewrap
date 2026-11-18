// Saves a gift from /admin. The only server code on the site; everything else is static.
//
// On Vercel it commits the image and the updated gifts.json to GitHub in ONE commit
// (git data API: blobs → tree → commit → move the branch), which triggers one rebuild,
// so the gift is live about a minute later. Two separate file commits were the simpler
// option but would mean two rebuilds and a moment where the entry exists without its image.
//
// Run locally (npm run dev) without GITHUB_TOKEN, it writes to src/data and public/images
// instead, so the page can be tried without touching GitHub.
//
// Settings (Vercel project → Settings → Environment Variables):
//   ADMIN_PASSWORD  the password /admin asks for
//   GITHUB_TOKEN    fine-grained token, Contents: read and write, this repo only
//   GITHUB_REPO     optional, default aviaviaviii/bubblewrap
//   GITHUB_BRANCH   optional, default main
import type { APIRoute } from "astro";
import { createHash, timingSafeEqual } from "node:crypto";
import { makeGift, encodeGiftImage } from "../../lib/gift-core.mjs";

export const prerender = false;

const env = (k: string) => process.env[k] ?? (import.meta.env[k] as string | undefined);
const DATA_PATH = "src/data/gifts.json";
const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5MB; the page shrinks big photos first

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Hashing both sides first makes the comparison constant-time whatever the lengths.
// Both sides are trimmed: a space or newline pasted into the Vercel setting along
// with the password otherwise makes every attempt fail with "Wrong password".
function passwordMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(expected.trim()).digest();
  return timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request }) => {
  const expected = env("ADMIN_PASSWORD");
  if (!expected) return json(503, { error: "The admin password isn't set up yet" });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "That didn't come through. Try again" });
  }

  if (!passwordMatches(String(form.get("password") ?? ""), expected)) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return json(401, { error: "Wrong password" });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return json(400, { error: "Add an image" });
  if (file.size > MAX_UPLOAD) return json(400, { error: "That image is too large. Try a smaller one" });

  let image: Buffer;
  try {
    image = await encodeGiftImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    return json(400, { error: "That file couldn't be read as an image" });
  }

  const input = {
    title: form.get("title"),
    link: form.get("link"),
    price: form.get("price"),
    tags: form.getAll("tags").join(","),
    draft: form.get("draft") === "on",
  };

  try {
    const token = env("GITHUB_TOKEN");
    if (token) return json(200, await commitToGitHub(token, input, image));
    if (import.meta.env.DEV) return json(200, await writeLocally(input, image));
    return json(503, { error: "The GitHub key isn't set up yet" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(e instanceof GiftError ? 400 : 500, { error: message });
  }
};

class GiftError extends Error {}
const asGiftError = (fn: () => any) => {
  try { return fn(); } catch (e) { throw new GiftError((e as Error).message); }
};

async function writeLocally(input: object, image: Buffer) {
  const { readFile, writeFile } = await import("node:fs/promises");
  const gifts = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const gift = asGiftError(() => makeGift(gifts, input));
  await writeFile(`public${gift.image}`, image);
  await writeFile(DATA_PATH, JSON.stringify([gift, ...gifts], null, 2) + "\n");
  return { title: gift.title, slug: gift.slug, draft: gift.draft, where: "your local files" };
}

async function commitToGitHub(token: string, input: object, image: Buffer, attempt = 1): Promise<object> {
  const repo = env("GITHUB_REPO") ?? "aviaviaviii/bubblewrap";
  const branch = env("GITHUB_BRANCH") ?? "main";
  const gh = async (path: string, init: RequestInit = {}, accept = "application/vnd.github+json") => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept, "x-github-api-version": "2022-11-28", ...init.headers },
    });
    if (!res.ok) {
      const err = new Error(`GitHub said ${res.status} on ${path}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return accept.includes("raw") ? res.text() : res.json();
  };
  const post = (path: string, body: object) => gh(path, { method: "POST", body: JSON.stringify(body) });

  let ref;
  try {
    ref = await gh(`/git/ref/heads/${branch}`);
  } catch (e) {
    const s = (e as { status?: number }).status;
    if (s === 401 || s === 403 || s === 404) throw new Error("The GitHub key can't reach the repo. Check it has Contents: read and write on it");
    throw e;
  }
  const head = ref.object.sha;
  const commit = await gh(`/git/commits/${head}`);
  const gifts = JSON.parse(await gh(`/contents/${DATA_PATH}?ref=${head}`, {}, "application/vnd.github.raw+json"));

  const gift = asGiftError(() => makeGift(gifts, input));
  const [imageBlob, dataBlob] = await Promise.all([
    post("/git/blobs", { content: image.toString("base64"), encoding: "base64" }),
    post("/git/blobs", { content: JSON.stringify([gift, ...gifts], null, 2) + "\n", encoding: "utf-8" }),
  ]);
  const tree = await post("/git/trees", {
    base_tree: commit.tree.sha,
    tree: [
      { path: `public${gift.image}`, mode: "100644", type: "blob", sha: imageBlob.sha },
      { path: DATA_PATH, mode: "100644", type: "blob", sha: dataBlob.sha },
    ],
  });
  const created = await post("/git/commits", {
    message: `Add gift: ${gift.title}\n\nAdded from /admin.`,
    tree: tree.sha,
    parents: [head],
  });

  try {
    await gh(`/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: created.sha, force: false }) });
  } catch (e) {
    // Someone pushed in between (a commit from the laptop, or a second gift). Start over
    // from the new head once, so neither change is lost.
    if ((e as { status?: number }).status === 422 && attempt === 1) return commitToGitHub(token, input, image, 2);
    throw e;
  }
  return { title: gift.title, slug: gift.slug, draft: gift.draft, where: "github", commit: created.sha.slice(0, 7) };
}
