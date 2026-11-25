import { useCallback, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { isStaffAdmin, signInMethod } from "../../auth/AdminGate";
import { ADMIN_PATH, asset } from "../../lib/base";
import { friendlyError } from "../../lib/errors";
import Icon from "../../components/Icon";
import { Button, ErrorText, Field, inputClass } from "../../components/ui";
import Turnstile, { turnstileEnabled } from "../../components/Turnstile";
import { usePrivatePage } from "../../lib/seo";

// Separate sign-in for the admin panel: email + password only, staff roles only.
export default function AdminLogin() {
  usePrivatePage("Staff Sign In");
  const { session, profile, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next");
  const target = next && next.startsWith(ADMIN_PATH) ? next : ADMIN_PATH;
  const reauth = params.get("reauth") === "1";

  const [email, setEmail] = useState(profile?.email ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const onToken = useCallback((t: string | null) => setCaptcha(t), []);

  // already inside with the right account and a password login
  if (!loading && session && profile && isStaffAdmin(profile.role) && signInMethod(session) === "password" && !busy) {
    return <Navigate to={target} replace />;
  }

  async function submit() {
    setError("");
    const clean = email.trim().toLowerCase();
    if (!clean || !password) return setError("Enter your admin email and password.");
    if (turnstileEnabled && !captcha) return setError("Please complete the check above.");
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password, options: { captchaToken: captcha ?? undefined } });
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    if (error) {
      setBusy(false);
      return setError(/invalid login credentials/i.test(error.message) ? "Wrong email or password." : friendlyError(error));
    }
    const { data: p } = await supabase.from("profiles").select("role, is_blocked").eq("id", data.user.id).maybeSingle();
    if (!p || p.is_blocked || !isStaffAdmin(p.role)) {
      await supabase.auth.signOut();
      setBusy(false);
      return setError("This account doesn't have access to the admin panel.");
    }
    navigate(target, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm rounded-4xl bg-white px-7 py-9 shadow-lift">
        <div className="mb-6 flex items-center gap-3">
          <img src={asset("favicon.svg")} alt="" width={44} height={44} className="h-11 w-11 rounded-md" />
          <div>
            <div className="font-extrabold">Green Basket</div>
            <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ink-muted"><Icon name="shield" size={13} /> Admin console</div>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold">Staff sign in</h1>
        <p className="mb-6 mt-1 text-sm text-ink-muted">
          {reauth ? "For security, the admin panel needs your email and password, even if you're logged in to the shop." : "Authorised staff only. Use the email and password the owner gave you."}
        </p>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          <Field label="Email"><input type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></Field>
          <div>
            <label htmlFor="admin-pw" className="mb-1.5 block text-sm font-medium text-ink-soft">Password</label>
            <div className="relative">
              <input id="admin-pw" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-16`} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-3 my-auto h-8 rounded-md px-2 text-xs font-semibold text-ink-muted hover:text-ink">{show ? "Hide" : "Show"}</button>
            </div>
          </div>
          <Turnstile onToken={onToken} resetKey={captchaReset} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy}>Sign in to admin</Button>
        </form>
        <p className="mt-6 text-center text-xs text-ink-muted">Forgot your password? Ask the store owner to reset it, or use “Forgot password” in the shop.</p>
      </div>
    </div>
  );
}
