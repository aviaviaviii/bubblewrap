# bubble—wrap

Source for [bubblewrap.in](https://bubblewrap.in): gifts that feel like art. It started on Framer and is now a static [Astro](https://astro.build) site.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Where things live

| What | Where |
| --- | --- |
| Gifts (the old Framer CMS) | `src/data/gifts.json` |
| Site copy, nav tags, author link, newsletter | `src/site.config.ts` |
| Layout (banner, header, footer, night mode) | `src/layouts/Page.astro` |
| Product grid | `src/components/GiftGrid.astro` |
| Styles | `src/styles/global.css` |
| Original Framer CSV export | `data/framer-collection.csv` |

### Pages

- `/` shows **NEW** (the 12 most recently dated gifts) and then **SORTED BY PRICE** (every gift, most expensive first).
- `/<tag>` (`/live`, `/play`, `/read`, `/wear`, `/cook`, `/santa`, `/work`) shows the same two sections for one tag. Only the tags in `navTags` appear in the menu.
- `/success` is where the newsletter form lands after a signup (copied from the live Framer page).
- Gifts with `"draft": true` don't appear anywhere.

Space Mono is self-hosted from `public/fonts/`, so the site makes no calls to Google Fonts.

### Adding a gift

Add an object to `src/data/gifts.json`:

```json
{
  "slug": "my-new-thing",
  "title": "My New Thing",
  "image": "/images/my-new-thing.webp",
  "imageAlt": "My New Thing",
  "price": 2499,
  "tags": ["live", "play"],
  "date": "2026-11-18",
  "link": "https://shop.example/products/my-new-thing",
  "description": "",
  "draft": false
}
```

Put the image in `public/images/` (webp, about 800px wide). The `date` decides whether the gift shows under NEW.

### Re-importing from Framer

```bash
npm run import:framer   # reads data/framer-collection.csv and rewrites src/data/gifts.json
```

## Before switching the domain off Framer

1. **Images:** done for gifts. All 409 now load from `public/images/` as 800px webp, made from the PullPage asset export with `npm run images:import -- "<export folder>"`. Two other routes give the same result: `npm run images:local -- ~/Downloads` for loose files named by Framer image id or slug, and `npm run images:download` to fetch from Framer's CDN. All three write through `scripts/lib/gift-image.mjs`. The favicon and OG image are in `public/` too, so nothing loads from Framer anymore.
2. **Newsletter:** signups go to a Google Sheet you own. Set up and wired in: the deployed script URL is the default in `src/site.config.ts`. Signups from the Framer form are in Formspark (form `gnbd4wE8`); export them as CSV and paste them into the sheet so nobody is lost.
3. **Deploy:** works on any static host. On Vercel, import the repo; `vercel.json` already turns on clean URLs (`/live`, not `/live.html`).

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
