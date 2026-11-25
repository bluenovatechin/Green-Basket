import { BASE } from "./base";

/**
 * Public facts about the business, used in the footer, legal pages and search-engine data (JSON-LD).
 * Fill these in with your REAL details before launch. Empty values are simply left out; nothing is invented.
 * Support email and phone come from Admin → Settings, so they can be changed without a new release.
 */
export const BUSINESS = {
  name: "Green Basket",
  tagline: "Eat Fresh. Live Better.",
  /** Registered business / legal entity name, e.g. "Green Basket Fresh Foods" or the proprietor's firm name. */
  legalName: "",
  /** Street address of the store or dark store (shown on legal pages and to Google). */
  streetAddress: "",
  city: "",
  postalCode: "",
  region: "Gujarat",
  country: "IN",
  /** GSTIN, if registered. */
  gstin: "",
  /** FSSAI licence / registration number (needed to sell food in India). */
  fssai: "",
  /** Grievance officer (required by the DPDP Act 2023 and the Consumer Protection (E-Commerce) Rules 2020). */
  grievanceOfficer: { name: "", email: "" },
  /** Opening hours for search results, e.g. "Mo-Su 07:00-21:00". */
  openingHours: "",
};

/** Date the legal pages were last changed. Update it whenever you edit them. */
export const LEGAL_UPDATED = "2026-11-25";

/**
 * Canonical public address of the site, without a trailing slash. Set VITE_SITE_URL at build time
 * (e.g. https://greenbasket.in). Falls back to wherever the app is running.
 */
export const SITE_URL: string = (
  (import.meta.env.VITE_SITE_URL as string | undefined) ||
  (typeof window !== "undefined" ? window.location.origin + BASE : "")
).replace(/\/+$/, "");

/** Absolute URL for an in-app path, e.g. abs("/privacy"). */
export const abs = (path = "/") => SITE_URL + (path.startsWith("/") ? path : `/${path}`).replace(/^\/$/, "/");

export const GA4_ID = (import.meta.env.VITE_GA4_ID as string | undefined)?.trim() || "";

/** URL-friendly name: "Apple (Shimla)" -> "apple-shimla". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Clean, canonical product address: /p/apple-shimla */
export const productPath = (p: { name: string }) => `/p/${slugify(p.name)}`;
/** Category address: /c/fruits */
export const categoryPath = (c: { slug: string }) => `/c/${c.slug}`;
