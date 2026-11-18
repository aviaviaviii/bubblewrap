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
- `/success` is where the newsletter form should send people after signing up (copied from the live Framer page).
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

1. **Images:** done for gifts. All 409 now load from `public/images/` as 800px webp, made from the PullPage asset export with `npm run images:import -- "<export folder>"`. Two other routes still work: `npm run images:local -- ~/Downloads` copies loose files named by Framer image id or slug (as is, not resized to webp), and `npm run images:download` fetches from Framer's CDN. The favicon and OG image are in `public/` too, so nothing loads from Framer anymore.
2. **Newsletter:** the Framer form posted through Framer's own backend. Set `PUBLIC_NEWSLETTER_ACTION` to your email provider's form endpoint (the field is named `email`). Until it's set, the button only says "Soon!".
3. **Deploy:** works on any static host. On Vercel, import the repo; `vercel.json` already turns on clean URLs (`/live`, not `/live.html`).
