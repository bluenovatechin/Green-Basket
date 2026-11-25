import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.49.4";
import { env, HttpError } from "./http.ts";

let _admin: SupabaseClient | null = null;

/** Server-side client with the service role: bypasses row-level security. Never send this key to a browser. */
export function adminDb(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

/** Reads the caller's access token and returns the logged-in user and their role. */
export async function requireUser(req: Request): Promise<{ user: User; role: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "NOT_AUTHENTICATED");
  const db = adminDb();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "NOT_AUTHENTICATED");
  const { data: profile } = await db.from("profiles").select("role, is_blocked").eq("id", data.user.id).single();
  if (!profile || profile.is_blocked) throw new HttpError(403, "ACCOUNT_BLOCKED");
  return { user: data.user, role: profile.role };
}
