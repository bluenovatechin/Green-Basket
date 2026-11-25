// Cookie / storage consent (GDPR + India's DPDP Act: opt-in, recorded, changeable at any time).
//
// Categories:
//  - necessary: login session, basket, this consent choice. Always on; the shop can't work without them.
//  - analytics: Google Analytics 4, only if VITE_GA4_ID is set AND the visitor opts in. Off by default.
import { useSyncExternalStore } from "react";
import { GA4_ID } from "./site";

export interface Consent { necessary: true; analytics: boolean; decidedAt: string; version: 1 }

const KEY = "gb_consent";
const listeners = new Set<() => void>();
let current: Consent | null = read();
let panelOpen = false;

function read(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    return c.version === 1 ? c : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function saveConsent(analytics: boolean) {
  current = { necessary: true, analytics, decidedAt: new Date().toISOString(), version: 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  panelOpen = false;
  applyConsent();
  emit();
}

/** Re-open the banner (footer "Cookie settings" link). */
export function openCookieSettings() {
  panelOpen = true;
  emit();
}

export function useConsent() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => `${current?.decidedAt ?? ""}|${panelOpen}`,
    () => "",
  );
  return { consent: current, showBanner: panelOpen || current === null, analyticsAvailable: Boolean(GA4_ID) };
}

// ---------- Google Analytics 4 (loaded only after opt-in) ----------
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}
let gaLoaded = false;

function applyConsent() {
  if (!GA4_ID) return;
  const granted = current?.analytics === true;
  if (granted && !gaLoaded) {
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", GA4_ID, { send_page_view: false, anonymize_ip: true });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
    document.head.appendChild(s);
  } else if (gaLoaded) {
    window.gtag?.("consent", "update", { analytics_storage: granted ? "granted" : "denied" });
  }
}

/** Page view for single-page navigation. No-op without consent. */
export function trackPageView(path: string) {
  if (!gaLoaded || current?.analytics !== true) return;
  window.gtag?.("event", "page_view", { page_path: path, page_location: window.location.href, page_title: document.title });
}

if (typeof window !== "undefined") applyConsent();
