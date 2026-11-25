import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? "http://localhost:54321", key ?? "missing-key", {
  // PKCE + detectSessionInUrl: needed for "Continue with Google" (the code comes back in the URL)
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

/** Calls one of our Edge Functions with the user's login token. Throws Error(code) on failure. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const res = await fetch(`${url}/functions/v1/${name}`, {
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
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: key ?? "", Authorization: `Bearer ${session.session?.access_token ?? ""}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP_${res.status}`);
  return json as T;
}
