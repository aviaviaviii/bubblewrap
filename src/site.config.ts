export const site = {
  title: "bubblewrap - gifts that feel like art",
  description:
    "A link of beautiful art-like things you can gift, which warms the heart. Gifts you're tempted to keep, but love to give even more. Indulge a little.",
  url: "https://bubblewrap.in",
  // Copied from the Framer site settings (not in the asset export). Page.astro makes ogImage absolute.
  ogImage: "/og.png",
  favicon: "/favicon.png",
  author: { label: "AUTHOR", href: "https://twitter.com/aviaviaviii" },

  // Tags shown in the top nav. Every tag in the data still gets its own page (/cook, /santa, …).
  navTags: ["live", "play", "read", "wear"],

  // How many of the most recently dated gifts appear under "NEW".
  newCount: 12,

  // Scrolling banner (desktop) and intro block (mobile).
  marquee: [
    "This site is a collection of links",
    "Gifts that feel like art",
    "This site is a collection of links",
    "Your next birthday wishlist",
  ],
  intro:
    "This site is a collection of links — to gifts that feel like art, ones you'll be tempted to keep and that warms the heart <3",

  // Newsletter: signups go to a Google Sheet we own, through the Apps Script in
  // newsletter/apps-script.gs (setup in the README). The default is that script's
  // deployed web app URL; it's public (it ships in the page HTML), so it lives here
  // rather than in host settings. PUBLIC_NEWSLETTER_ACTION overrides it, e.g. to
  // test against another sheet. Replaced Substack, which made readers confirm on
  // Substack's own page.
  newsletter: {
    label: "once a month, just the new stuff *",
    action:
      import.meta.env.PUBLIC_NEWSLETTER_ACTION ??
      "https://script.google.com/macros/s/AKfycbxML_05QzArvYBM8fO7iCBvK6fYmXIFmp0VDk2SnCw46ZxcSIJnDTKjScds1ros0mrUpw/exec",
    success: "/success",
  },

  // Analytics: PostHog, in bubblewrap's own PostHog organisation (the free plan allows one
  // project per org, and the other one already holds the Total Home Solutions app, so the
  // two sites' numbers stay apart). The project key is public by design (it ships in the
  // page), so it lives here like the newsletter URL. Empty key = no tracking at all.
  // Head.astro loads it on production builds only, and never on /admin.
  posthog: {
    key: import.meta.env.PUBLIC_POSTHOG_KEY ?? "phc_tAYwkfSyZQ3AksREkXZxNDjA9oyMjTwQVxVXz9A4QYFh",
    host: "https://us.i.posthog.com",
  },
};
