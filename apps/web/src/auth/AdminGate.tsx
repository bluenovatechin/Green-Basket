import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "./AuthProvider";
import { ADMIN_PATH } from "../lib/base";
import { FullPageSpinner } from "../components/ui";
import NotFound from "../pages/NotFound";

/** How this session was signed in ("password", "oauth", "otp"…), read from the access token's amr claim. */
export function signInMethod(session: Session | null): string | null {
  if (!session) return null;
  try {
    const payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const amr = (payload.amr ?? []) as { method: string; timestamp: number }[];
    if (!amr.length) return null;
    return amr.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).method;
  } catch {
    return null;
  }
}

export const isStaffAdmin = (role?: string | null) => role === "admin" || role === "packer";

/**
 * Guards the admin panel:
 *  - not logged in                  -> the admin login page (not the shop login)
 *  - logged in but not admin/packer -> "Page not found" (we don't reveal that a panel exists)
 *  - admin who came in via Google   -> asked to log in again with email + password
 * The database enforces the same roles on every request, so this is about the experience, not the only lock.
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  const here = encodeURIComponent(location.pathname + location.search);

  if (loading || (session && !profile)) return <FullPageSpinner />;
  if (!session) return <Navigate to={`${ADMIN_PATH}/login?next=${here}`} replace />;
  if (!profile || profile.is_blocked || !isStaffAdmin(profile.role)) return <NotFound />;
  if (signInMethod(session) !== "password") return <Navigate to={`${ADMIN_PATH}/login?reauth=1&next=${here}`} replace />;
  return <>{children}</>;
}
