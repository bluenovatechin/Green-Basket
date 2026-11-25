// GitHub Pages has no URL rewrites: serve index.html for unknown paths (e.g. /Green-Basket/orders/123)
// by copying it to 404.html, and disable Jekyll so files starting with "_" or "." are published.
import { copyFileSync, writeFileSync, existsSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
if (!existsSync(new URL("index.html", dist))) {
  console.error("dist/index.html not found. Run the build first.");
  process.exit(1);
}
copyFileSync(new URL("index.html", dist), new URL("404.html", dist));
writeFileSync(new URL(".nojekyll", dist), "");
console.log("GitHub Pages files ready: 404.html, .nojekyll");
