# Contributing

Thanks for helping. There are two ways in: add a gift, or improve the code.

## Add a gift

bubblewrap is a small, picky list: gifts that feel like art, that you'd be tempted to keep. Before opening a pull request, check the gift:

- is something you'd be happy to receive, not just useful
- links to the maker's or shop's own product page, over https
- isn't already on the site (search `src/data/gifts.json` for the link)

Then:

```bash
npm install
npm run gift -- https://shop.example/products/thing --image ~/Downloads/thing.png
```

It asks for the title, price (in rupees, whole number) and tags, saves the image as an 800px webp named after the slug, and adds the gift to the top of `src/data/gifts.json`. Use the shop's own product photo.

Tags in use: `live`, `play`, `read`, `wear`, `cook`, `santa`, `work`. Pick from these where you can.

Run `npm test` and `npm run dev` to check it, then open a pull request with one gift per PR. Picks are a matter of taste, so a gift may be declined even when everything passes. That's not a judgement on you.

Not sure? Open a gift suggestion issue instead.

## Improve the code

```bash
npm install
npm run dev          # http://localhost:4321
npm test             # fast checks
npm run test:all     # everything CI runs, including browsers
```

The README explains where things live. A few things to keep:

- The site is static and makes no third-party calls apart from the newsletter form and analytics. Keep it that way.
- Plain on purpose. If a change adds something to the page, say in the PR why it earns its place.
- Add or update a test for any behaviour you change.

Small fixes can go straight to a pull request. For anything bigger, open an issue first so we can agree on the direction.

## Reporting a security issue

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repo (Security, then Report a vulnerability).
