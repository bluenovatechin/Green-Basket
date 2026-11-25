import { useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { friendlyError } from "../../lib/errors";
import { appUrl, asset } from "../../lib/base";
import { heroImage } from "../../lib/images";
import Icon from "../../components/Icon";
import { Button, ErrorText, Field, inputClass } from "../../components/ui";
import Turnstile, { turnstileEnabled } from "../../components/Turnstile";

type Intent = "login" | "signup";
type Step = "email" | "code" | "password";

// Ways in:
//  - Continue with Google: one tap, works for new and existing customers
//  - Email + one-time code: "Log in" (existing accounts only) or "Create account" (asks for a name)
//  - Email + password: staff accounts created by the admin
export default function Login() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const [intent, setIntent] = useState<Intent>(params.get("mode") === "signup" ? "signup" : "login");
  const [step, setStep] = useState<Step>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(params.get("error_description") ?? "");
  const [noAccount, setNoAccount] = useState(false);
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

  const cleanEmail = email.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const switchIntent = (i: Intent) => { setIntent(i); setError(""); setNoAccount(false); setStep("email"); setCode(""); };

  async function google() {
    setError("");
    setBusy("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appUrl(`/login?next=${encodeURIComponent(safeNext)}`) },
    });
    if (error) {
      setBusy(null);
      setError(friendlyError(error));
    }
  }

  async function sendCode() {
    setError("");
    setNoAccount(false);
    if (intent === "signup" && name.trim().length < 2) return setError("Please enter your name.");
    if (!validEmail) return setError("Please enter a valid email address.");
    if (turnstileEnabled && !captcha) return setError("Please complete the check above.");
    setBusy("send");
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: intent === "signup",
        data: intent === "signup" ? { full_name: name.trim() } : undefined,
        emailRedirectTo: appUrl(`/login?next=${encodeURIComponent(safeNext)}`),
        captchaToken: captcha ?? undefined,
      },
    });
    setBusy(null);
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    if (error) {
      // "Log in" with an email that has no account yet
      if (intent === "login" && /signups? not allowed|not found|otp_disabled/i.test(`${error.message} ${(error as { code?: string }).code ?? ""}`)) {
        setNoAccount(true);
        return;
      }
      return setError(friendlyError(error));
    }
    setStep("code");
    setCooldown(60);
  }

  async function verifyCode() {
    setError("");
    setBusy("verify");
    const { error } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code.trim(), type: "email" });
    setBusy(null);
    if (error) setError(friendlyError(error));
    // success: the auth listener sets the session and <Navigate> above takes over
  }

  async function passwordLogin() {
    setError("");
    if (!validEmail || !password) return setError("Enter your email and password.");
    if (turnstileEnabled && !captcha) return setError("Please complete the check above.");
    setBusy("password");
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password, options: { captchaToken: captcha ?? undefined } });
    setBusy(null);
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    if (error) setError(/invalid login/i.test(error.message) ? "Wrong email or password." : friendlyError(error));
  }

  const title = step === "code" ? "Check your email" : step === "password" ? "Staff login" : intent === "signup" ? "Create your account" : "Welcome back";
  const subtitle =
    step === "code" ? <>We sent a login code to <b className="text-ink">{cleanEmail}</b></>
    : step === "password" ? "For store staff with a password from the admin."
    : intent === "signup" ? "Join Green Basket to order fresh produce in minutes." : "Log in to see your basket and orders.";

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-4xl bg-white shadow-soft ring-1 ring-line/60 md:grid-cols-2">
      <div className="relative hidden md:block">
        <img src={heroImage()} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-8 text-white">
          <p className="text-sm font-semibold text-brand-accent">Eat Fresh. Live Better.</p>
          <p className="mt-1 text-2xl font-extrabold leading-tight">Fresh from the mandi,<br />at your door every day.</p>
        </div>
      </div>

      <div className="px-6 py-10 sm:px-12 sm:py-12">
        <img src={asset("favicon.svg")} alt="" className="mb-6 h-12 w-12 rounded-2xl" />

        {step === "email" && (
          <div className="mb-6 grid grid-cols-2 rounded-full bg-surface p-1 text-sm font-semibold" role="tablist" aria-label="Log in or create account">
            {(["login", "signup"] as const).map((i) => (
              <button key={i} role="tab" aria-selected={intent === i} onClick={() => switchIntent(i)}
                className={`h-10 rounded-full transition ${intent === i ? "bg-white text-ink shadow-soft" : "text-ink-muted hover:text-ink"}`}>
                {i === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="mb-7 mt-1 text-ink-muted">{subtitle}</p>

        {step === "email" && (
          <div className="space-y-4">
            <button onClick={google} disabled={busy !== null}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white px-4 font-semibold text-ink ring-1 ring-inset ring-line transition hover:bg-surface disabled:opacity-60">
              <GoogleIcon />
              {busy === "google" ? "Opening Google…" : intent === "signup" ? "Sign up with Google" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-ink-muted">
              <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
            </div>

            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
              {intent === "signup" && (
                <Field label="Your name">
                  <input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Asha Patel" />
                </Field>
              )}
              <Field label="Email address">
                <input type="email" inputMode="email" autoComplete="email" required value={email}
                  onChange={(e) => { setEmail(e.target.value); setNoAccount(false); }} className={inputClass} placeholder="you@example.com" />
              </Field>
              <Turnstile onToken={onToken} resetKey={captchaReset} />

              {noAccount && (
                <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                  <b>No account found for {cleanEmail}.</b>
                  <p className="mt-1">New here? Create an account in a few seconds.</p>
                  <Button type="button" variant="dark" className="mt-3" onClick={() => switchIntent("signup")}>Create account</Button>
                </div>
              )}
              <ErrorText>{error}</ErrorText>

              <Button type="submit" size="lg" className="w-full" loading={busy === "send"}>
                {intent === "signup" ? "Create account" : "Send login code"} <Icon name="arrowRight" size={18} />
              </Button>
              <p className="text-center text-xs text-ink-muted">We'll email you a one-time code. No password needed.</p>
            </form>

            <p className="pt-2 text-center text-sm text-ink-muted">
              {intent === "login" ? <>New to Green Basket? <button className="font-semibold text-brand" onClick={() => switchIntent("signup")}>Create an account</button></>
                : <>Already have an account? <button className="font-semibold text-brand" onClick={() => switchIntent("login")}>Log in</button></>}
            </p>
            <p className="text-center text-sm">
              <button className="font-medium text-ink-muted hover:text-ink" onClick={() => { setStep("password"); setError(""); }}>Staff? Log in with password</button>
            </p>
          </div>
        )}

        {step === "code" && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void verifyCode(); }}>
            <Field label="Login code">
              <input inputMode="numeric" autoComplete="one-time-code" required maxLength={10} autoFocus placeholder="••••••"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} text-center text-2xl font-bold tracking-[0.5em]`} />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" size="lg" className="w-full" loading={busy === "verify"} disabled={code.length < 6}>
              {intent === "signup" ? "Verify and create account" : "Verify and log in"}
            </Button>
            <div className="rounded-2xl bg-surface p-3 text-xs text-ink-muted">
              Can't find it? Check Spam/Promotions. If the email shows a button instead of a code, open it on <b>this same device and browser</b>. It logs you in too.
            </div>
            <div className="flex justify-between text-sm">
              <button type="button" className="flex items-center gap-1 font-medium text-ink-muted hover:text-ink" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
                <Icon name="chevronLeft" size={16} /> Change email
              </button>
              <button type="button" className="font-semibold text-brand disabled:font-medium disabled:text-ink-muted" disabled={cooldown > 0 || busy !== null}
                onClick={() => { setStep("email"); setCode(""); }}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        {step === "password" && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void passwordLogin(); }}>
            <Field label="Email"><input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></Field>
            <Turnstile onToken={onToken} resetKey={captchaReset} />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" size="lg" className="w-full" loading={busy === "password"}>Log in</Button>
            <button type="button" className="flex w-full items-center justify-center gap-1 text-sm font-medium text-ink-muted hover:text-ink" onClick={() => { setStep("email"); setError(""); }}>
              <Icon name="chevronLeft" size={16} /> Back to customer login
            </button>
          </form>
        )}

        <p className="mt-8 text-xs text-ink-muted">By continuing you agree to our terms and privacy policy.</p>
      </div>
    </div>
  );
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
