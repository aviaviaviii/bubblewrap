export const site = {
  title: "bubblewrap - gifts that feel like art",
  description:
    "A link of beautiful art-like things you can gift, which warms the heart. Gifts you're tempted to keep, but love to give even more. Indulge a little.",
  url: "https://bubblewrap.in",
  // TODO: download these into public/ and switch to "/og.png" and "/favicon.png".
  ogImage: "https://framerusercontent.com/assets/hF1bskfZvFiIaiKbDjSKSRBpUw.png",
  favicon: "https://framerusercontent.com/images/9M43dHlL241oVyTSHotlVpj8qlo.png",
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

  // Newsletter: set PUBLIC_NEWSLETTER_ACTION to your provider's form POST URL
  // (Buttondown, Mailchimp, Loops, Beehiiv embed, …). Field name is "email".
  newsletter: {
    label: "once a month, just the new stuff *",
    action: import.meta.env.PUBLIC_NEWSLETTER_ACTION ?? "",
  },
};
