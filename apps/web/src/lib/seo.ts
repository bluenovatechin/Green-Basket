import { useEffect } from "react";
import { abs, BUSINESS } from "./site";
import { asset } from "./base";

export interface Crumb { name: string; path: string }

export interface SeoInput {
  /** Page title WITHOUT the brand; " | Green Basket" is added. Aim for 50-60 characters in total. */
  title: string;
  /** 140-160 characters, unique per page. */
  description: string;
  /** In-app path of the canonical page, e.g. "/c/fruits". */
  path: string;
  /** Absolute or in-app image for social previews (1200x630 preferred). */
  image?: string;
  /** Private pages (basket, account...) are kept out of search results. */
  noindex?: boolean;
  /** Extra JSON-LD objects for this page. */
  jsonLd?: object[];
  /** Breadcrumb trail; adds BreadcrumbList structured data. */
  crumbs?: Crumb[];
  /** ISO date for informational pages. */
  dateModified?: string;
  type?: "website" | "article" | "product";
}

const BRAND = BUSINESS.name;
export const DEFAULT_OG_IMAGE = () => toAbs(asset("og-image.jpg"));

function toAbs(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return new URL(url, window.location.origin).toString();
}

function setMeta(attr: "name" | "property", key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setJsonLd(data: object[]) {
  document.head.querySelectorAll("script[data-seo]").forEach((s) => s.remove());
  for (const d of data) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.dataset.seo = "1";
    s.textContent = JSON.stringify(d);
    document.head.appendChild(s);
  }
}

export function breadcrumbLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })),
  };
}

/** Sets title, description, canonical, Open Graph / Twitter tags and JSON-LD for the current page. */
export function useSeo(s: SeoInput) {
  const key = JSON.stringify(s);
  useEffect(() => {
    const title = s.title.includes(BRAND) ? s.title : `${s.title} | ${BRAND}`;
    if (import.meta.env.DEV) {
      if (title.length < 30 || title.length > 60) console.warn(`[seo] title is ${title.length} chars (aim 50-60): ${title}`);
      if (s.description.length < 120 || s.description.length > 160) console.warn(`[seo] description is ${s.description.length} chars (aim 140-160)`);
    }
    const url = abs(s.path);
    const image = s.image ? toAbs(s.image) : DEFAULT_OG_IMAGE();
    document.title = title;
    setMeta("name", "description", s.description);
    setMeta("name", "robots", s.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    setLink("canonical", url);
    setMeta("property", "og:type", s.type === "product" ? "product" : s.type === "article" ? "article" : "website");
    setMeta("property", "og:site_name", BRAND);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", s.description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", image);
    setMeta("property", "og:locale", "en_IN");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", s.description);
    setMeta("name", "twitter:image", image);
    setMeta("property", "article:modified_time", s.dateModified ?? null);
    const ld = [...(s.jsonLd ?? [])];
    if (s.crumbs?.length) ld.push(breadcrumbLd(s.crumbs));
    setJsonLd(s.noindex ? [] : ld);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Pages that are personal or for staff: proper title, but kept out of search results. */
export function usePrivatePage(title: string) {
  useSeo({
    title,
    description: "Fresh vegetables and fruit delivered at home in the time slot you choose. Order online and pay by UPI, card or cash on delivery.",
    path: typeof window !== "undefined" ? window.location.pathname.slice(import.meta.env.BASE_URL.length - 1) || "/" : "/",
    noindex: true,
  });
}
