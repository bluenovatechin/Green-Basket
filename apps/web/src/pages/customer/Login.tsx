import { useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { friendlyError } from "../../lib/errors";
import { Button, Card, ErrorText, Field, inputClass } from "../../components/ui";
import Turnstile, { turnstileEnabled } from "../../components/Turnstile";

type Mode = "choose" | "code" | "password";

// Three ways in:
//  1. Continue with Google (one tap, no email needed)          -> most customers
//  2. Email + one-time code (sent via Supabase Auth / Brevo)   -> customers without Google
//  3. Email + password (accounts created by the admin)         -> staff: admin, packers, riders
export default function Login() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const safeNext = next.startsWith("/") ? next : "/";
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(params.get("error_description") ?? "");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const onToken = useCallback((t: string | null) => setCaptcha(t), []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (session) return <Navigate to={safeNext} replace />;

  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  async function google() {
    setError("");
    setBusy("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(safeNext)}` },
    });
    if (error) {
      setBusy(null);
      setError(friendlyError(error));
    }
    // on success the browser goes to Google and comes back here, already logged in
  }

  async function sendCode() {
    setError("");
    if (!validEmail(email)) return setError("Please enter a valid email address.");
    if (turnstileEnabled && !captcha) return setError("Please complete the check above.");
    setBusy("send");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, captchaToken: captcha ?? undefined },
    });
    setBusy(null);
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    if (error) return setError(friendlyError(error));
    setCodeSent(true);
    setCooldown(60);
  }

  async function verifyCode() {
    setError("");
    setBusy("verify");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(null);
    if (error) setError(friendlyError(error));
  }

  async function passwordLogin() {
    setError("");
    if (!validEmail(email) || !password) return setError("Enter your email and password.");
    if (turnstileEnabled && !captcha) return setError("Please complete the check above.");
    setBusy("password");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
      options: { captchaToken: captcha ?? undefined },
    });
    setBusy(null);
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    if (error) setError(/invalid login/i.test(error.message) ? "Wrong email or password." : friendlyError(error));
  }

  const back = () => { setMode("choose"); setError(""); setCodeSent(false); setCode(""); };

  return (
    <div className="mx-auto max-w-sm py-6">
      <div className="mb-5 text-center">
        <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
        <h1 className="text-2xl font-bold">Welcome to Green Basket</h1>
        <p className="text-sm text-gray-600">Fresh fruits &amp; vegetables at your door</p>
      </div>

      <Card className="space-y-4">
        {mode === "choose" && (
          <>
            <button
              onClick={google}
              disabled={busy !== null}
              className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-60"
            >
              <GoogleIcon />
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200" /> or <span className="h-px flex-1 bg-gray-200" />
            </div>

            <Button variant="secondary" className="w-full" onClick={() => { setMode("code"); setError(""); }}>
              ✉️ Continue with email code
            </Button>
            <ErrorText>{error}</ErrorText>
            <p className="text-center text-sm">
              <button className="text-gray-500 underline" onClick={() => { setMode("password"); setError(""); }}>
                Staff? Log in with password
              </button>
            </p>
          </>
        )}

        {mode === "code" && !codeSent && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
            <Field label="Email address" hint="We'll email you a login code. No password needed.">
              <input type="email" inputMode="email" autoComplete="email" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
            </Field>
            <Turnstile onToken={onToken} resetKey={captchaReset} />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" loading={busy === "send"}>Send code</Button>
            <BackLink onClick={back} />
          </form>
        )}

        {mode === "code" && codeSent && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void verifyCode(); }}>
            <p className="text-sm text-gray-600">Enter the code we sent to <b>{email}</b>.</p>
            <Field label="Login code" hint="Check your spam folder if it doesn't arrive within a minute.">
              <input inputMode="numeric" autoComplete="one-time-code" required maxLength={10} autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} text-center text-2xl tracking-[0.4em]`} />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" loading={busy === "verify"} disabled={code.length < 6}>Verify and continue</Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-brand" onClick={() => { setCodeSent(false); setCode(""); }}>Change email</button>
              <button type="button" className="text-brand disabled:text-gray-400" disabled={cooldown > 0}
                onClick={() => { setCodeSent(false); setCode(""); }}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        {mode === "password" && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void passwordLogin(); }}>
            <Field label="Email"><input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></Field>
            <Turnstile onToken={onToken} resetKey={captchaReset} />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" loading={busy === "password"}>Log in</Button>
            <p className="text-xs text-gray-500">Staff accounts are created by the store admin.</p>
            <BackLink onClick={back} />
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-gray-500">By continuing you agree to our terms and privacy policy.</p>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return <button type="button" className="w-full text-center text-sm text-gray-500" onClick={onClick}>← Other ways to log in</button>;
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
