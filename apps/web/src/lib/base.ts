// The site can live at the root of a domain (greenbasket.in/) or in a folder
// (bluenovatechin.github.io/Green-Basket/). BASE_URL is set at build time from VITE_BASE.
export const BASE = import.meta.env.BASE_URL; // always ends with "/"

/** Path to a file in /public, e.g. asset("favicon.svg") */
export const asset = (path: string) => BASE + path.replace(/^\//, "");

/**
 * Private address of the admin panel, e.g. /gb-console. Change it with VITE_ADMIN_PATH (letters, digits, - or _).
 * Hiding the address is only an extra layer: the real protection is the admin role,
 * which the database checks on every request.
 */
export const ADMIN_PATH = "/" + (((import.meta.env.VITE_ADMIN_PATH as string | undefined) || "gb-console").replace(/[^A-Za-z0-9_-]/g, "") || "gb-console");

/** Full URL of an app page, e.g. appUrl("/login") -> https://host/Green-Basket/login */
export const appUrl = (path: string) => window.location.origin + BASE + path.replace(/^\//, "");
