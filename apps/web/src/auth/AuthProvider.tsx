import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { AUTH_STORAGE_KEY, OPENED_IN_ADMIN_AREA, isAdminArea, supabase } from "../lib/supabase";
import type { Profile, Role } from "../lib/types";
import { FullPageSpinner } from "../components/ui";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  const userIdRef = useRef<string | null | undefined>(undefined);
  const location = useLocation();

  // A tab is bound to the area it opened in (shop or admin console), because each has its own login.
  // If in-app navigation crosses into the other area, reload so the right login is used.
  useEffect(() => {
    // window.location has the full address (incl. a GitHub Pages folder); the router's pathname doesn't
    if (isAdminArea() !== OPENED_IN_ADMIN_AREA) window.location.reload();
  }, [location.pathname]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      userIdRef.current = data.session?.user.id ?? null;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const newId = s?.user.id ?? null;
      const switched = userIdRef.current !== undefined && userIdRef.current !== newId;
      userIdRef.current = newId;
      setSession(s);
      if (switched || event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // defer: never await Supabase calls inside this callback
        setTimeout(() => {
          // a different person (or nobody) is now logged in: forget everything cached for the previous one
          if (switched) qc.clear();
          void loadProfile(s);
        }, 0);
      }
    });

    // Shop and admin console have separate logins (see lib/supabase.ts). Within ONE area, all tabs follow the
    // same login: when another tab of the same area logs in, logs out or switches account, this tab reloads
    // so it never shows the previous person's data. Changes in the other area are ignored.
    const onStorage = async (e: StorageEvent) => {
      if (e.key !== null && e.key !== AUTH_STORAGE_KEY) return;
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id ?? null;
      if (userIdRef.current !== undefined && id !== userIdRef.current) {
        qc.clear();
        window.location.reload();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [loadProfile, qc]);

  const value: AuthState = {
    session,
    profile,
    loading,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Sends logged-out visitors to /login and brings them back afterwards. */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading || (session && !profile)) return <FullPageSpinner />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (profile?.is_blocked) return <div className="p-6 text-center">Your account is on hold. Please contact support.</div>;
  if (roles && (!profile || !roles.includes(profile.role))) return <Navigate to="/" replace />;
  return <>{children}</>;
}
