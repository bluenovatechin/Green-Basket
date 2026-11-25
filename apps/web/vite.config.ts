import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // VITE_BASE: "/" for your own domain (default), "/Green-Basket/" for GitHub Pages.
  const env = loadEnv(mode, process.cwd(), "");
  const raw = env.VITE_BASE || "/";
  const base = ("/" + raw.replace(/^\/+|\/+$/g, "") + "/").replace(/^\/\/$/, "/");

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
        manifest: {
          id: base,
          name: "Green Basket – Fresh Fruits & Vegetables",
          short_name: "Green Basket",
          description: "Fresh fruits and vegetables delivered to your home.",
          start_url: base,
          scope: base,
          display: "standalone",
          orientation: "portrait",
          background_color: "#ffffff",
          theme_color: "#00663A",
          lang: "en-IN",
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
            { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
            { src: `${base}icons/icon-512-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/\/\.well-known\//],
          runtimeCaching: [
            {
              // product photos from Cloudflare R2: cache on the phone, they never change at the same URL
              urlPattern: ({ url }) => url.pathname.startsWith("/products/") && /\.(webp|jpe?g|png)$/.test(url.pathname),
              handler: "CacheFirst",
              options: { cacheName: "product-images", expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
      }),
    ],
    build: { sourcemap: false },
  };
});
