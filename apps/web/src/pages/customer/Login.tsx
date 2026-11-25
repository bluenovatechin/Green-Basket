import { useCallback, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { friendlyError } from "../../lib/errors";
import { appUrl, asset } from "../../lib/base";
import { heroImage } from "../../lib/images";
import { useCart } from "../../state/cart";
import Icon from "../../components/Icon";
import { Button, ErrorText, Field, inputClass } from "../../components/ui";
import Turnstile, { turnstileEnabled } from "../../components/Turnstile";

type Intent = "login" | "signup";
type Step = "form" | "forgot" | "forgot-sent" | "confirm-email";

const MIN_PASSWORD = 8;

// Email + password for everyone (customers and staff), plus one-tap Google.
// Email is only needed for "Forgot password" (and for sign-up confirmation if that's switched on in Supabase).
export default function Login() {
  const { session } = useAuth();
  const { count } = useCart();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const [intent, setIntent] = useState<Intent>(params.get("mode") === "signup" ? "signup" : "login");
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(params.get("error_description") ?? "");
  const [hint, setHint] = useState<"" | "no-account" | "exists" | "unconfirmed">("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const onToken = useCallback((t: string | null) => setCaptcha(t), []);

  if (session) return <Navigate to={safeNext} replace />;

  const cleanEmail = email.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const reset = () => { setError(""); setHint(""); };
  const switchIntent = (i: Intent) => { setIntent(i); setStep("form"); reset(); };
  const takeCaptcha = () => {
    const t = captcha ?? undefined;
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    return t;
  };

  async function google() {
    reset();
    setBusy("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appUrl(`/login?next=${encodeURIComponent(safeNext)}`) },
    });
    if (error) { setBusy(null); setError(friendlyError(error)); }
  }

  async function submit() {
    reset();
    if (intent === "signup" && name.trim().length < 2) return setError("Please enter your name.");
    if (!validEmail) return setError("Please enter a valid email address.");
    if (password.length < (intent === "signup" ? MIN_PASSWORD : 1)) {
      return setError(intent === "signup" ? `Password must be at least ${MIN_PASSWORD} characters.` : "Please enter your password.");
    }
    if (turnstileEnabled && !captcha) return setError("Please complete the check above.");
    setBusy("submit");

    if (intent === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password, options: { captchaToken: takeCaptcha() } });
      setBusy(null);
      if (!error) return; // the auth listener logs them in; <Navigate> above takes over
      if (/invalid login credentials/i.test(error.message)) { setHint("no-account"); return setError("Wrong email or password."); }
      if (/email not confirmed/i.test(error.message)) { setHint("unconfirmed"); return setError("Please confirm your email first. Check your inbox."); }
      return setError(friendlyError(error));
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: appUrl("/login"), captchaToken: takeCaptcha() },
    });
    setBusy(null);
    if (error) {
      if (/already registered|already exists/i.test(error.message)) { setHint("exists"); return setError("An account with this email already exists."); }
      return setError(friendlyError(error));
    }
    // With "Confirm email" ON, Supabase hides whether the email is taken: an existing account comes back with no identities
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setHint("exists");
      return setError("An account with this email already exists.");
    }
    if (!data.session) setStep("confirm-email"); // "Confirm email" is ON: they must click the link first
  }

  async function sendReset() {
    reset();
    if (!validEmail) return setError("Please enter the email you signed up with.");
    if (turnstileEnabled && !captcha) return setError("Please complete the check above.");
    setBusy("forgot");
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: appUrl("/reset-password"), captchaToken: takeCaptcha() });
    setBusy(null);
    if (error) return setError(friendlyError(error));
    setStep("forgot-sent");
  }

  async function resendConfirmation() {
    reset();
    setBusy("resend");
    const { error } = await supabase.auth.resend({ type: "signup", email: cleanEmail, options: { emailRedirectTo: appUrl("/login") } });
    setBusy(null);
    if (error) setError(friendlyError(error));
    else setStep("confirm-email");
  }

  const heading = {
    form: intent === "signup" ? ["Create your account", "Join Green Basket and order fresh produce in minutes."] : ["Welcome back", "Log in to see your basket and orders."],
    forgot: ["Reset your password", "Enter your email and we'll send you a link to set a new password."],
    "forgot-sent": ["Check your email", `If an account exists for ${cleanEmail}, we've sent a password reset link.`],
    "confirm-email": ["Confirm your email", `We sent a confirmation link to ${cleanEmail}. Open it on this device to finish creating your account.`],
  }[step];

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

        {step === "form" && (
          <div className="mb-6 grid grid-cols-2 rounded-full bg-surface p-1 text-sm font-semibold" role="tablist" aria-label="Log in or create account">
            {(["login", "signup"] as const).map((i) => (
              <button key={i} role="tab" aria-selected={intent === i} onClick={() => switchIntent(i)}
                className={`h-10 rounded-full transition ${intent === i ? "bg-white text-ink shadow-soft" : "text-ink-muted hover:text-ink"}`}>
                {i === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-extrabold">{heading[0]}</h1>
        <p className="mb-6 mt-1 text-ink-muted">{heading[1]}</p>

        {count > 0 && step === "form" && (
          <p className="mb-5 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand">
            <Icon name="bag" size={18} /> Your {count} basket item{count === 1 ? "" : "s"} will be saved to your account.
          </p>
        )}

        {step === "form" && (
          <div className="space-y-4">
            <button onClick={google} disabled={busy !== null}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white px-4 font-semibold text-ink ring-1 ring-inset ring-line transition hover:bg-surface disabled:opacity-60">
              <GoogleIcon />
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-ink-muted">
              <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
            </div>

            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
              {intent === "signup" && (
                <Field label="Your name">
                  <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Asha Patel" />
                </Field>
              )}
              <Field label="Email address">
                <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setHint(""); }} className={inputClass} placeholder="you@example.com" />
              </Field>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="pw" className="text-sm font-medium text-ink-soft">Password</label>
                  {intent === "login" && (
                    <button type="button" className="text-sm font-semibold text-brand" onClick={() => { setStep("forgot"); reset(); }}>Forgot password?</button>
                  )}
                </div>
                <div className="relative">
                  <input id="pw" type={showPassword ? "text" : "password"} autoComplete={intent === "signup" ? "new-password" : "current-password"}
                    value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-16`}
                    placeholder={intent === "signup" ? `At least ${MIN_PASSWORD} characters` : "Your password"} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-3 my-auto h-8 rounded-full px-2 text-xs font-semibold text-ink-muted hover:text-ink">
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {intent === "signup" && password.length > 0 && password.length < MIN_PASSWORD && (
                  <p className="mt-1 text-xs text-ink-muted">{MIN_PASSWORD - password.length} more character{MIN_PASSWORD - password.length === 1 ? "" : "s"}</p>
                )}
              </div>
              <Turnstile onToken={onToken} resetKey={captchaReset} />

              <ErrorText>{error}</ErrorText>
              {hint === "no-account" && (
                <p className="text-sm text-ink-muted">New here? <button type="button" className="font-semibold text-brand" onClick={() => switchIntent("signup")}>Create an account</button> · or <button type="button" className="font-semibold text-brand" onClick={() => { setStep("forgot"); reset(); }}>reset your password</button></p>
              )}
              {hint === "exists" && (
                <p className="text-sm text-ink-muted"><button type="button" className="font-semibold text-brand" onClick={() => switchIntent("login")}>Log in instead</button> · <button type="button" className="font-semibold text-brand" onClick={() => { setStep("forgot"); reset(); }}>Forgot password?</button></p>
              )}
              {hint === "unconfirmed" && (
                <Button type="button" variant="secondary" loading={busy === "resend"} onClick={resendConfirmation}>Resend confirmation email</Button>
              )}

              <Button type="submit" size="lg" className="w-full" loading={busy === "submit"}>
                {intent === "signup" ? "Create account" : "Log in"} <Icon name="arrowRight" size={18} />
              </Button>
            </form>

            <p className="pt-1 text-center text-sm text-ink-muted">
              {intent === "login"
                ? <>New to Green Basket? <button className="font-semibold text-brand" onClick={() => switchIntent("signup")}>Create an account</button></>
                : <>Already have an account? <button className="font-semibold text-brand" onClick={() => switchIntent("login")}>Log in</button></>}
            </p>
          </div>
        )}

        {step === "forgot" && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void sendReset(); }} noValidate>
            <Field label="Email address">
              <input type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
            </Field>
            <Turnstile onToken={onToken} resetKey={captchaReset} />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" size="lg" className="w-full" loading={busy === "forgot"}>Send reset link</Button>
            <BackLink onClick={() => { setStep("form"); reset(); }} />
          </form>
        )}

        {(step === "forgot-sent" || step === "confirm-email") && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-ink-soft">
              <Icon name="mail" size={20} className="mt-0.5 text-brand" />
              <span>Open the email <b>on this same device and browser</b>. Can't find it? Check Spam or Promotions.</span>
            </div>
            <ErrorText>{error}</ErrorText>
            {step === "confirm-email" && (
              <Button variant="secondary" className="w-full" loading={busy === "resend"} onClick={resendConfirmation}>Resend email</Button>
            )}
            <BackLink onClick={() => { setStep("form"); setIntent("login"); reset(); }} label="Back to log in" />
          </div>
        )}

        <p className="mt-8 text-xs text-ink-muted">By continuing you agree to our terms and privacy policy.</p>
      </div>
    </div>
  );
}

function BackLink({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="flex w-full items-center justify-center gap-1 text-sm font-medium text-ink-muted hover:text-ink" onClick={onClick}>
      <Icon name="chevronLeft" size={16} /> {label}
    </button>
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
