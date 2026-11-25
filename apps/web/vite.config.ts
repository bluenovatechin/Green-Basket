import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** Same rule as src/lib/site.ts slugify(), so sitemap URLs match the app's product URLs. */
const slugify = (t: string) =>
  t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Build-time SEO + security:
 *  - fills __SITE_URL__ in index.html (canonical, Open Graph)
 *  - adds the Google Search Console verification tag when VITE_GSC_VERIFICATION is set
 *  - adds a Content-Security-Policy <meta> (production builds only; dev needs inline scripts for hot reload)
 *  - writes robots.txt and sitemap.xml (products and categories are read from the public catalogue)
 */
function seoAndSecurity(env: Record<string, string>, base: string): Plugin {
  const siteUrl = (env.VITE_SITE_URL || "").replace(/\/+$/, "");
  const supabaseUrl = env.VITE_SUPABASE_URL || "";
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "*.supabase.co";
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  let isBuild = false;

  return {
    name: "gb-seo-security",
    configResolved(c) {
      isBuild = c.command === "build";
    },
    transformIndexHtml(html) {
      let out = html.replaceAll("__SITE_URL__", siteUrl || base.replace(/\/$/, ""));
      const gsc = (env.VITE_GSC_VERIFICATION || "").replace(/[^A-Za-z0-9_-]/g, "");
      out = out.replace("<!--gsc-verification-->", gsc ? `<meta name="google-site-verification" content="${gsc}" />` : "");
      if (isBuild) out = out.replace("<meta charset=\"UTF-8\" />", `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      return out;
    },
    async generateBundle() {
      if (!siteUrl) {
        this.warn("VITE_SITE_URL is not set: sitemap.xml and robots.txt use relative addresses. Set it for production.");
      }
      const today = new Date().toISOString().slice(0, 10);
      const urls: { loc: string; priority: string; changefreq: string }[] = [
        { loc: "/", priority: "1.0", changefreq: "daily" },
        { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
        { loc: "/terms", priority: "0.3", changefreq: "yearly" },
      ];
      if (supabaseUrl && env.VITE_SUPABASE_ANON_KEY) {
        const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };
        try {
          const ctl = AbortSignal.timeout(8000);
          const [cats, prods] = await Promise.all([
            fetch(`${supabaseUrl}/rest/v1/categories?select=slug&is_active=eq.true`, { headers, signal: ctl }).then((r) => (r.ok ? r.json() : [])),
            fetch(`${supabaseUrl}/rest/v1/products?select=name&is_active=eq.true`, { headers, signal: ctl }).then((r) => (r.ok ? r.json() : [])),
          ]);
          for (const c of cats as { slug: string }[]) urls.push({ loc: `/c/${c.slug}`, priority: "0.8", changefreq: "daily" });
          for (const p of prods as { name: string }[]) urls.push({ loc: `/p/${slugify(p.name)}`, priority: "0.7", changefreq: "daily" });
        } catch (e) {
          this.warn(`sitemap: couldn't read products (${(e as Error).message}); only main pages are listed.`);
        }
      }
      const root = siteUrl || base.replace(/\/$/, "");
      const sitemap =
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((u) => `  <url><loc>${root}${u.loc === "/" ? "/" : u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n") +
        `\n</urlset>\n`;
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });

      // Personal pages are kept out of search. The staff console is deliberately NOT listed here:
      // robots.txt is public, and naming it would reveal its private address. It sends "noindex" itself.
      const p = base.replace(/\/$/, "");
      const robots = [
        "User-agent: *",
        "Allow: /",
        ...["/cart", "/checkout", "/account", "/orders", "/login", "/reset-password", "/rider"].map((x) => `Disallow: ${p}${x}`),
        // robots.txt needs a full address for the sitemap, so the line is added only when VITE_SITE_URL is set
        ...(siteUrl ? ["", `Sitemap: ${siteUrl}/sitemap.xml`] : []),
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
    },
  };
}

export default defineConfig(({ mode }) => {
  // VITE_BASE: "/" for your own domain (default), "/Green-Basket/" for GitHub Pages.
  const env = loadEnv(mode, process.cwd(), "");
  const raw = env.VITE_BASE || "/";
  const base = ("/" + raw.replace(/^\/+|\/+$/g, "") + "/").replace(/^\/\/$/, "/");

  return {
    base,
    plugins: [
      react(),
      seoAndSecurity(env, base),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false, // registered in src/lib/pwa.ts, which also applies updates right away
        includeAssets: ["favicon.svg", "favicon.ico", "icons/apple-touch-icon.png", "icons/favicon-32x32.png", "icons/favicon-16x16.png"],
        manifest: {
          id: base,
          name: "Green Basket: Fresh Vegetables & Fruits",
          short_name: "Green Basket",
          description: "Order fresh vegetables and fruit for home delivery in the time slot you choose.",
          start_url: base,
          scope: base,
          display: "standalone",
          orientation: "portrait",
          background_color: "#F7F5EF",
          theme_color: "#0D5C3A",
          lang: "en-IN",
          categories: ["food", "shopping"],
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
            { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
            { src: `${base}icons/icon-512-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/\/\.well-known\//, /\/sitemap\.xml$/, /\/robots\.txt$/],
          runtimeCaching: [
            {
              // product photos (Supabase Storage / R2) and bundled demo photos: cache on the phone
              urlPattern: ({ url }) => /\/(products|images)\/.+\.(webp|avif|jpe?g|png)$/.test(url.pathname),
              handler: "CacheFirst",
              options: { cacheName: "product-images", expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
      }),
    ],
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          // libraries change rarely: separate files stay cached in the browser between releases
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            supabase: ["@supabase/supabase-js"],
            query: ["@tanstack/react-query"],
          },
        },
      },
    },
  };
});
