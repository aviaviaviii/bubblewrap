import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://bubblewrap.in",
  trailingSlash: "never",
  build: { format: "file" },
});
