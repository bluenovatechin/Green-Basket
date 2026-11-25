import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useAddresses, useSettings } from "../../lib/api";
import ClaimStoreBanner from "../../components/ClaimStoreBanner";
import { InstallCard } from "../../components/InstallApp";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import AddressForm from "../../components/AddressForm";
import { Button, Card, ErrorText, Field, inputClass } from "../../components/ui";
import { usePrivatePage } from "../../lib/seo";

export default function Account() {
  usePrivatePage("My Account");
  const { profile, refreshProfile, signOut } = useAuth();
  const addresses = useAddresses();
  const settings = useSettings();
  const supportEmail = settings.data?.support_email;
  const qc = useQueryClient();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  async function save() {
    setError(""); setMsg("");
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return setError("Enter a 10-digit mobile number.");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() || null, phone: phone || null }).eq("id", profile!.id);
    setSaving(false);
    if (error) return setError(friendlyError(error));
    await refreshProfile();
    setMsg("Saved.");
  }

  async function remove(id: string) {
    if (!confirm("Delete this address?")) return;
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) setError(friendlyError(error));
    qc.invalidateQueries({ queryKey: ["addresses"] });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="display text-3xl">Your account</h1>
      <ClaimStoreBanner />
      {profile?.role === "rider" && (
        <Link to="/rider" className="block rounded-2xl bg-brand-light p-4 font-semibold text-brand">
          Open rider screen →
        </Link>
      )}
      <Card className="space-y-3">
        <div className="text-sm text-ink-soft">Logged in as <b>{profile?.email}</b></div>
        <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Mobile number" hint="The rider calls this number if needed.">
          <input className={inputClass} value={phone} inputMode="numeric" maxLength={10} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <ErrorText>{error}</ErrorText>
        {msg && <p className="text-sm text-brand">{msg}</p>}
        <Button loading={saving} onClick={save}>Save</Button>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Addresses</h2>
        {adding ? (
          <AddressForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
        ) : (
          <div className="space-y-2">
            {addresses.data?.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                <span><b>{a.label}</b>{a.is_default && " · default"}<br />{a.line1}, {a.city} {a.pincode}</span>
                <button className="text-red-600" onClick={() => remove(a.id)}>Delete</button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setAdding(true)}>+ Add address</Button>
          </div>
        )}
      </Card>

      <Card className="space-y-2 text-sm">
        {settings.data?.support_phone && <a className="block text-brand" href={`tel:${settings.data.support_phone}`}>Call support: {settings.data.support_phone}</a>}
        {supportEmail && <a className="block text-brand" href={`mailto:${supportEmail}`}>Email support: {supportEmail}</a>}
        {supportEmail && <a className="block text-brand" href={`mailto:${supportEmail}?subject=Delete%20my%20account`}>Request account deletion</a>}
      </Card>
      <InstallCard />
      <Button variant="secondary" className="w-full" onClick={signOut}>Log out</Button>
    </div>
  );
}
