import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../../lib/api";
import { callFunction, supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import type { Profile, Role } from "../../lib/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button, Card, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";
import Icon from "../../components/Icon";

type StaffRole = Exclude<Role, "customer">;

const ROLES: { value: StaffRole; label: string; does: string }[] = [
  { value: "rider", label: "Rider", does: "Sees their deliveries on the Rider screen, marks them delivered, collects cash." },
  { value: "packer", label: "Packer", does: "Sees orders and stock in the console, packs orders. Can't change prices or settings." },
  { value: "admin", label: "Admin", does: "Full access: products, prices, slots, settings and staff." },
];

/** Easy-to-read random password (no 0/O/1/l confusion). */
function makePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export default function Staff() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const staff = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").neq("role", "customer").order("role").order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "staff"] });

  if (staff.isLoading) return <FullPageSpinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Staff</h1>
        <p className="text-sm text-ink-muted">Create logins for your riders, packers and admins. They don't need to sign up themselves.</p>
      </div>

      <AddStaff onDone={refresh} />

      <Card>
        <h2 className="mb-1 font-semibold">Current staff</h2>
        <p className="mb-3 text-xs text-ink-muted">{staff.data?.length ?? 0} people</p>
        <ul className="divide-y divide-line">
          {staff.data?.map((p) => (
            <StaffRow key={p.id} person={p} isMe={p.id === session?.user.id} onChanged={refresh} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AddStaff({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("rider");
  const [password, setPassword] = useState(makePassword);
  const [showPw, setShowPw] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { status: string; email: string; password: string; role: StaffRole }>(null);

  async function save() {
    setError("");
    setDone(null);
    if (!email.trim()) return setError("Enter their email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const r = await callFunction<{ status: "created" | "role_updated" }>("staff-create", {
        action: "create", email: email.trim(), full_name: name.trim(), password, role,
      });
      setDone({ status: r.status, email: email.trim().toLowerCase(), password, role });
      setName(""); setEmail(""); setPassword(makePassword());
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const roleInfo = ROLES.find((r) => r.value === role)!;

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Add a staff member</h2>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">Role</span>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={`rounded-2xl px-3 py-2.5 text-sm font-semibold ring-1 ring-inset transition ${
                role === r.value ? "bg-brand-light text-brand ring-brand" : "bg-white text-ink ring-line hover:bg-surface"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">{roleInfo.does}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh Patel" autoComplete="off" /></Field>
        <Field label="Email (used to log in)"><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rider01@gmail.com" autoComplete="off" /></Field>
      </div>

      <Field label="Password for them" hint="At least 8 characters. Share it with them privately; they can change it later with “Forgot password”.">
        <div className="flex gap-2">
          <input
            className={`${inputClass} font-mono`}
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Button type="button" variant="secondary" className="flex-none" onClick={() => setShowPw((s) => !s)}>{showPw ? "Hide" : "Show"}</Button>
          <Button type="button" variant="secondary" className="flex-none" onClick={() => { setPassword(makePassword()); setShowPw(true); }}>New</Button>
        </div>
      </Field>

      <ErrorText>{error}</ErrorText>
      <Button className="w-full sm:w-auto" loading={busy} onClick={save}><Icon name="plus" size={18} /> Add {roleInfo.label.toLowerCase()}</Button>
      <p className="text-xs text-ink-muted">If this email already has an account, they simply get the new role and keep their own password.</p>

      {done && <Credentials {...done} onClose={() => setDone(null)} />}
    </Card>
  );
}

function Credentials({ status, email, password, role, onClose }: { status: string; email: string; password: string; role: StaffRole; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const where = role === "rider" ? "the Rider screen (Account → Rider)" : "the staff console";
  const text = `Green Basket login\nEmail: ${email}\nPassword: ${password}\nOpen the app, log in, then go to ${where}.`;
  if (status === "role_updated") {
    return (
      <div className="rounded-2xl bg-brand-light p-4 text-sm text-brand">
        <b>{email}</b> already had an account. They are now a <b>{role}</b> and log in with their own password.
        <button className="ml-2 underline" onClick={onClose}>OK</button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl bg-brand-light p-4 text-sm">
      <div className="font-semibold text-brand">Login created. Send these details to them:</div>
      <pre className="whitespace-pre-wrap break-all rounded-xl bg-white p-3 font-mono text-xs text-ink">{text}</pre>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* clipboard blocked */ }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

function StaffRow({ person, isMe, onChanged }: { person: Profile; isMe: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newPw, setNewPw] = useState<string | null>(null);

  async function changeRole(r: Role) {
    if (r === "customer" && !confirm(`Remove staff access for ${person.email}? They keep a normal shop account.`)) return;
    setError(""); setBusy(true);
    try {
      await rpc("admin_set_role", { p_email: person.email, p_role: r });
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const pw = makePassword();
    if (!confirm(`Set a new password for ${person.email}? Their old password will stop working.`)) return;
    setError(""); setBusy(true);
    try {
      await callFunction("staff-create", { action: "set_password", user_id: person.id, password: pw });
      setNewPw(pw);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface text-sm font-bold text-ink-soft">
          {(person.full_name || person.email).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{person.full_name || person.email.split("@")[0]}{isMe && <span className="ml-1 text-xs font-normal text-ink-muted">(you)</span>}</div>
          <div className="truncate text-xs text-ink-muted">{person.email}</div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <select
            className={`${inputClass} !w-auto flex-1 !py-2 text-sm sm:flex-none`}
            value={person.role}
            disabled={busy || isMe}
            onChange={(e) => changeRole(e.target.value as Role)}
            aria-label="Role"
          >
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {!isMe && (
            <>
              <button className="h-10 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand-light disabled:opacity-50" disabled={busy} onClick={resetPassword}>
                New password
              </button>
              <button className="h-10 rounded-full px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={busy} onClick={() => changeRole("customer")}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      {newPw && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-light p-3 text-sm">
          New password: <code className="rounded-lg bg-white px-2 py-1 font-mono">{newPw}</code>
          <button className="text-brand underline" onClick={() => void navigator.clipboard?.writeText(newPw)}>Copy</button>
          <button className="ml-auto text-ink-muted" onClick={() => setNewPw(null)}>Hide</button>
        </div>
      )}
    </li>
  );
}
