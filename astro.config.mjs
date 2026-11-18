import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

// Every page is still built as static HTML. The Vercel adapter is only here for the
// one server route, src/pages/api/gift.ts, which saves gifts from /admin.
export default defineConfig({
  site: "https://bubblewrap.in",
  trailingSlash: "never",
  build: { format: "file" },
  adapter: vercel(),
});
