import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { friendlyError } from "../../lib/errors";
import { asset } from "../../lib/base";
import Icon from "../../components/Icon";
import { Button, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";

// Opened from the "Reset your password" email. Supabase logs the person in from the link,
// then they choose a new password here.
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [waited, setWaited] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // give the link's code a moment to be exchanged for a session
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (loading || (!session && !waited)) return <FullPageSpinner />;

  async function save() {
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(/different from the old/i.test(error.message) ? "Choose a password different from your old one." : friendlyError(error));
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 1500);
  }

  return (
    <div className="mx-auto max-w-md rounded-4xl bg-white px-6 py-10 shadow-soft ring-1 ring-line/60 sm:px-10">
      <img src={asset("favicon.svg")} alt="" className="mb-6 h-12 w-12 rounded-2xl" />
      {!session ? (
        <>
          <h1 className="text-2xl font-extrabold">Link expired</h1>
          <p className="mt-2 text-ink-muted">
            This reset link has expired, was already used, or was opened in a different browser. Request a new one and open it on this device.
          </p>
          <Link to="/login"><Button className="mt-6 w-full">Back to log in</Button></Link>
        </>
      ) : done ? (
        <>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand"><Icon name="check" size={24} /></div>
          <h1 className="text-2xl font-extrabold">Password updated</h1>
          <p className="mt-2 text-ink-muted">You're logged in. Taking you to the shop…</p>
        </>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <div>
            <h1 className="text-2xl font-extrabold">Set a new password</h1>
            <p className="mt-1 text-ink-muted">For {session.user.email}</p>
          </div>
          <Field label="New password">
            <input type={show ? "text" : "password"} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
          </Field>
          <Field label="Repeat new password">
            <input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-brand" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" size="lg" className="w-full" loading={busy}>Save new password</Button>
        </form>
      )}
    </div>
  );
}
