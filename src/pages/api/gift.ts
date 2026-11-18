// Everything /admin does, behind the password. The only server code on the site;
// every page is static. One route, three actions (form field "action"):
//   add      (default) a new gift: title, image, price, tags, link, draft
//   drafts   list the gifts marked draft, newest first
//   publish  mark one draft live (form field "slug"), dated today so it shows under NEW
//
// Drafts are only ever sent after the password checks out. /admin is public on the
// custom domain, so building the list into the page would show unpublished gifts.
//
// On Vercel each change is ONE commit to GitHub (git data API: blobs → tree → commit →
// move the branch), which triggers one rebuild, so it's live about a minute later.
// Two separate file commits were simpler but meant two rebuilds and a moment where an
// entry exists without its image. Run locally (npm run dev) without GITHUB_TOKEN, it
// reads and writes src/data and public/images instead.
//
// Settings (Vercel project → Settings → Environment Variables):
//   ADMIN_PASSWORD  the password /admin asks for
//   GITHUB_TOKEN    fine-grained token, Contents: read and write, this repo only
//   GITHUB_REPO     optional, default aviaviaviii/bubblewrap
//   GITHUB_BRANCH   optional, default main
import type { APIRoute } from "astro";
import { createHash, timingSafeEqual } from "node:crypto";
import { makeGift, encodeGiftImage, today } from "../../lib/gift-core.mjs";

export const prerender = false;

const env = (k: string) => process.env[k] ?? (import.meta.env[k] as string | undefined);
const DATA_PATH = "src/data/gifts.json";
const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5MB; the page shrinks big photos first

type Gift = { slug: string; title: string; image: string; price: number; tags: string[]; date: string | null; draft: boolean; [k: string]: unknown };
type Change = { gifts: Gift[]; files?: { path: string; content: Buffer }[]; message: string; result: object };

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// A problem with what was asked (shown to the person as is), as opposed to a crash.
class GiftError extends Error {}

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

  let store: Store;
  try {
    store = pickStore();
  } catch (e) {
    return json(503, { error: (e as Error).message });
  }

  try {
    switch (String(form.get("action") ?? "add")) {
      case "drafts":
        return json(200, { drafts: await listDrafts(store) });
      case "publish":
        return json(200, await publish(store, String(form.get("slug") ?? "")));
      case "add":
        return json(200, await add(store, form));
      default:
        return json(400, { error: "Unknown action" });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(e instanceof GiftError ? 400 : 500, { error: message });
  }
};

// ---------- actions ----------

async function listDrafts(store: Store) {
  const { gifts } = await store.read();
  return gifts
    .filter((g) => g.draft)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map(({ slug, title, image, price, tags, date }) => ({ slug, title, image, price, tags, date }));
}

async function publish(store: Store, slug: string) {
  return store.change((gifts) => {
    const gift = gifts.find((g) => g.slug === slug);
    if (!gift) throw new GiftError("That draft isn't in the list anymore");
    if (!gift.draft) throw new GiftError(`${gift.title} is already published`);
    const updated = { ...gift, draft: false, date: today() };
    return {
      gifts: gifts.map((g) => (g.slug === slug ? updated : g)),
      message: `Publish gift: ${gift.title}\n\nPublished from /admin.`,
      result: { title: gift.title, slug },
    };
  });
}

async function add(store: Store, form: FormData) {
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) throw new GiftError("Add an image");
  if (file.size > MAX_UPLOAD) throw new GiftError("That image is too large. Try a smaller one");

  let image: Buffer;
  try {
    image = await encodeGiftImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    throw new GiftError("That file couldn't be read as an image");
  }

  const input = {
    title: form.get("title"),
    link: form.get("link"),
    price: form.get("price"),
    tags: form.getAll("tags").join(","),
    draft: form.get("draft") === "on",
  };

  return store.change((gifts) => {
    let gift: Gift;
    try {
      gift = makeGift(gifts, input);
    } catch (e) {
      throw new GiftError((e as Error).message);
    }
    return {
      gifts: [gift, ...gifts],
      files: [{ path: `public${gift.image}`, content: image }],
      message: `Add gift: ${gift.title}\n\nAdded from /admin.`,
      result: { title: gift.title, slug: gift.slug, draft: gift.draft },
    };
  });
}

// ---------- where the list lives ----------

// change() takes a function from the current list to the new one, so the GitHub
// store can re-run it against a newer list if someone pushed in the meantime.
type Store = {
  where: "github" | "local";
  read: () => Promise<{ gifts: Gift[] }>;
  change: (fn: (gifts: Gift[]) => Change) => Promise<object>;
};

function pickStore(): Store {
  const token = env("GITHUB_TOKEN");
  if (token) return githubStore(token);
  if (import.meta.env.DEV) return localStore();
  throw new Error("The GitHub key isn't set up yet");
}

const serialise = (gifts: Gift[]) => JSON.stringify(gifts, null, 2) + "\n";

function localStore(): Store {
  const read = async () => {
    const { readFile } = await import("node:fs/promises");
    return { gifts: JSON.parse(await readFile(DATA_PATH, "utf8")) as Gift[] };
  };
  return {
    where: "local",
    read,
    async change(fn) {
      const { writeFile } = await import("node:fs/promises");
      const c = fn((await read()).gifts);
      for (const f of c.files ?? []) await writeFile(f.path, f.content);
      await writeFile(DATA_PATH, serialise(c.gifts));
      return { ...c.result, where: "local" };
    },
  };
}

function githubStore(token: string): Store {
  const repo = env("GITHUB_REPO") ?? "aviaviaviii/bubblewrap";
  const branch = env("GITHUB_BRANCH") ?? "main";

  const gh = async (path: string, init: RequestInit = {}, accept = "application/vnd.github+json") => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept, "x-github-api-version": "2022-11-28", ...init.headers },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || (res.status === 404 && path.startsWith("/git/ref/"))) {
        throw new Error("The GitHub key can't reach the repo. Check it hasn't expired and has Contents: read and write on it");
      }
      const err = new Error(`GitHub said ${res.status} on ${path}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return accept.includes("raw") ? res.text() : res.json();
  };
  const post = (path: string, body: object) => gh(path, { method: "POST", body: JSON.stringify(body) });

  const read = async () => {
    const ref = await gh(`/git/ref/heads/${branch}`);
    const head: string = ref.object.sha;
    const gifts = JSON.parse(await gh(`/contents/${DATA_PATH}?ref=${head}`, {}, "application/vnd.github.raw+json"));
    return { gifts: gifts as Gift[], head };
  };

  return {
    where: "github",
    read,
    async change(fn) {
      for (let attempt = 1; ; attempt++) {
        const { gifts, head } = await read();
        const c = fn(gifts);
        const commit = await gh(`/git/commits/${head}`);
        const blobs = await Promise.all([
          ...(c.files ?? []).map((f) => post("/git/blobs", { content: f.content.toString("base64"), encoding: "base64" }).then((b) => ({ path: f.path, sha: b.sha }))),
          post("/git/blobs", { content: serialise(c.gifts), encoding: "utf-8" }).then((b) => ({ path: DATA_PATH, sha: b.sha })),
        ]);
        const tree = await post("/git/trees", {
          base_tree: commit.tree.sha,
          tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
        });
        const created = await post("/git/commits", { message: c.message, tree: tree.sha, parents: [head] });
        try {
          await gh(`/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: created.sha, force: false }) });
          return { ...c.result, where: "github", commit: created.sha.slice(0, 7) };
        } catch (e) {
          // Someone pushed in between (a commit from the laptop, or a second save).
          // Redo the change once on top of theirs, so neither is lost.
          if ((e as { status?: number }).status === 422 && attempt === 1) continue;
          throw e;
        }
      }
    },
  };
}
