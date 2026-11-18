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

  // Newsletter: the footer form opens Substack's subscribe page in a new tab with
  // the email already filled in (?email=), and the reader confirms there.
  // Substack has no public endpoint a custom form can POST to; its own form uses
  // an undocumented API, and its embed is a white box that can't be styled to match.
  // Live Framer posted to Formspark and landed on /success, which is now unused.
  newsletter: {
    label: "once a month, just the new stuff *",
    action: "https://bubblewrapindia.substack.com/subscribe",
  },
};
