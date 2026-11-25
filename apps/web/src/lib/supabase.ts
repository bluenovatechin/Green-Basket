import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_PATH, BASE } from "./base";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

const SUPABASE_URL = url ?? "http://localhost:54321";
const projectRef = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0];
  } catch {
    return "local";
  }
})();

// Two separate logins in one browser:
//  - SHOP  (customers, riders): the normal Supabase storage key, shared by all shop tabs
//  - ADMIN (admin console):     its own storage key, so an admin can stay signed in to the console in one tab
//                               while any customer (or nobody) is signed in to the shop in another tab.
export const SHOP_AUTH_KEY = `sb-${projectRef}-auth-token`;
export const ADMIN_AUTH_KEY = `sb-${projectRef}-admin-auth-token`;

const make = (storageKey: string) =>
  createClient(SUPABASE_URL, key ?? "missing-key", {
    // PKCE + detectSessionInUrl: needed for "Continue with Google" and password-reset links (the code comes back in the URL)
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey },
  });

/** True when this page is part of the admin console (decided by the address, e.g. /gb-console/...). */
export function isAdminArea(pathname = window.location.pathname): boolean {
  const p = "/" + pathname.slice(BASE.length).replace(/^\/+/, "");
  return p === ADMIN_PATH || p.startsWith(ADMIN_PATH + "/");
}

// Only the client for the area this tab opened in is created, so a shop tab never touches the admin login.
const AREA_IS_ADMIN = isAdminArea();
let shopClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;
export function client(): SupabaseClient {
  if (AREA_IS_ADMIN) return (adminClient ??= make(ADMIN_AUTH_KEY));
  return (shopClient ??= make(SHOP_AUTH_KEY));
}
export const AUTH_STORAGE_KEY = AREA_IS_ADMIN ? ADMIN_AUTH_KEY : SHOP_AUTH_KEY;
export const OPENED_IN_ADMIN_AREA = AREA_IS_ADMIN;

/** The Supabase client for this tab's area. Everything in the app uses this. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = client() as unknown as Record<PropertyKey, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

/**
 * fetch() to an Edge Function. A browser reports "Failed to fetch" both when the phone is offline and when the
 * function isn't deployed / blocks the request, so tell those apart instead of always saying "no internet".
 */
async function reach(name: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${url}/functions/v1/${name}`, init);
  } catch (e) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw e;
    throw new Error("FUNCTION_UNREACHABLE");
  }
}

/** Calls one of our Edge Functions with the user's login token. Throws Error(code) on failure. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const res = await reach(name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key ?? "",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP_${res.status}`);
  return json as T;
}

/** Uploads a file to an Edge Function as multipart/form-data. */
export async function uploadToFunction<T>(name: string, file: Blob, filename: string): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const form = new FormData();
  form.append("file", file, filename);
  const res = await reach(name, {
    method: "POST",
    headers: { apikey: key ?? "", Authorization: `Bearer ${session.session?.access_token ?? ""}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP_${res.status}`);
  return json as T;
}
