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
- Gifts with `"draft": true` don't appear anywhere.

### Adding a gift

Add an object to `src/data/gifts.json`:

```json
{
  "slug": "my-new-thing",
  "title": "My New Thing",
  "image": "/images/my-new-thing.png",
  "imageAlt": "My New Thing",
  "price": 2499,
  "tags": ["live", "play"],
  "date": "2026-11-18",
  "link": "https://shop.example/products/my-new-thing",
  "description": "",
  "draft": false
}
```

Put the image in `public/images/`. The `date` decides whether the gift shows under NEW.

### Re-importing from Framer

```bash
npm run import:framer   # reads data/framer-collection.csv and rewrites src/data/gifts.json
```

## Before switching the domain off Framer

1. **Images:** gift images still load from `framerusercontent.com`. If you already have them locally (named by Framer image id or by slug), run `npm run images:local -- ~/Downloads`. Otherwise run `npm run images:download` to copy them into `public/images/` and repoint the JSON, then commit. Do the same for the favicon and OG image in `src/site.config.ts`.
2. **Newsletter:** the Framer form posted through Framer's own backend. Set `PUBLIC_NEWSLETTER_ACTION` to your email provider's form endpoint (the field is named `email`). Until it's set, the button only says "Soon!".
3. **Deploy:** works on any static host. On Vercel, import the repo; `vercel.json` already turns on clean URLs (`/live`, not `/live.html`).
