import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "Green Basket – Fresh Fruits & Vegetables",
        short_name: "Green Basket",
        description: "Fresh fruits and vegetables delivered to your home.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#00663A",
        lang: "en-IN",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/\.well-known\//],
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
});
