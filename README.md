# bubble—wrap

Source for [bubblewrap.in](https://bubblewrap.in): gifts that feel like art. It started on Framer and is now a static [Astro](https://astro.build) site.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Tests

```bash
npm test             # unit, data, API, security, newsletter script, CLI scenarios
npm run test:e2e     # builds, then Playwright on desktop Chrome, Android Chrome, iPhone Safari
npm run test:all     # everything CI runs: types, coverage, build checks, browsers
```

| Folder | What it covers |
| --- | --- |
| `tests/unit` | `gift-core` rules, page sections and prices, `gifts.json` integrity (every image exists, no duplicate links or slugs) |
| `tests/api` | `/api/gift`: password gate, list, add, edit, publish, local and GitHub stores, push conflicts |
| `tests/security` | committed secrets, XSS sinks, `/admin` leaks, `noopener`, third-party requests, the newsletter Apps Script |
| `tests/scenario` | `npm run gift` and `npm run images:local` run for real; a gift's full life in `/admin` |
| `tests/build` | the built files: every page and image resolves, no drafts or secrets ship |
| `e2e/` | the site and `/admin` in real browsers; `/api/gift` is mocked, so the gift list is never touched |

CI (`.github/workflows/ci.yml`) runs all of it on every push and pull request, plus `npm audit` and a secret scan, and again every Monday.

## Where things live

| What | Where |
| --- | --- |
| Gifts | `src/data/gifts.json` |
| Site copy, nav tags, author link, newsletter | `src/site.config.ts` |
| Layout (banner, header, footer, night mode) | `src/layouts/Page.astro` |
| Product grid | `src/components/GiftGrid.astro` |
| Gift images (800px webp, named by slug) | `public/images/` |
| Styles | `src/styles/global.css` |

### Pages

- `/` shows **NEW** (the 12 most recently dated gifts) and then **SORTED BY PRICE** (every gift, most expensive first).
- `/<tag>` (`/live`, `/play`, `/read`, `/wear`, `/cook`, `/santa`, `/work`) shows the same two sections for one tag. Only the tags in `navTags` appear in the menu.
- `/success` is where the newsletter form lands after a signup (copied from the live Framer page).
- Gifts with `"draft": true` don't appear anywhere.

Space Mono is self-hosted from `public/fonts/`, so the site makes no calls to Google Fonts.

### Adding a gift

```bash
npm run gift -- https://shop.example/products/thing --image ~/Downloads/thing.png
```

It asks for the title, price and tags, writes the image as `public/images/<slug>.webp` (800px wide), and adds the gift to the top of `src/data/gifts.json` dated today, which puts it under NEW. Check it with `npm run dev`, then commit and push.

To skip the questions, pass everything as flags:

```bash
npm run gift -- <link> --image <file> --title "Thing" --price 2499 --tags live,play
```

Optional flags: `--date 2026-11-18`, `--description "..."`, `--draft` (hidden until you set `"draft": false`). A new tag gets its own page; add it to `navTags` in `src/site.config.ts` to show it in the menu.

To edit a gift (price, tags, link), change its entry in `src/data/gifts.json`. To replace gift images, name the files after their slugs and run `npm run images:local -- <folder>`.

## Before launch

1. **Newsletter:** signups go to a Google Sheet you own (see below). Signups from the old site are in Formspark (form `gnbd4wE8`); export them as CSV and paste them into the sheet so nobody is lost.
2. **Deploy:** works on any static host. On Vercel, import the repo; `vercel.json` already turns on clean URLs (`/live`, not `/live.html`).

## Newsletter

The footer form sends each signup to a Google Sheet through a small Apps Script ([newsletter/apps-script.gs](newsletter/apps-script.gs)). It adds a row with the time, the email and the page, skips duplicates, and ignores bots that fill the hidden `website` field. After sending, the reader lands on `/success`.

It's set up: the script's web app URL is `newsletter.action` in `src/site.config.ts`. `PUBLIC_NEWSLETTER_ACTION` overrides it, for example to test against another sheet.

To set it up again (a new sheet or a new Google account):

1. Create a Google Sheet (any name). The script adds a `signups` tab on the first signup.
2. In the sheet, open **Extensions → Apps Script**, replace the editor's contents with `newsletter/apps-script.gs`, and save.
3. **Deploy → New deployment**, type **Web app**, Execute as **Me**, Who has access **Anyone**. Authorise when Google asks.
4. Copy the web app URL (ends in `/exec`). Opening it in a browser should say "bubblewrap signups are open".
5. Put it in `newsletter.action` in `src/site.config.ts` (or set `PUBLIC_NEWSLETTER_ACTION` to override). Rebuild.

If you edit the script later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

To send the newsletter, export the `signups` tab as CSV and import it into whichever tool sends the email.
