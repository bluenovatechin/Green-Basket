import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useServicePincodes } from "../lib/api";
import { friendlyError } from "../lib/errors";
import { useAuth } from "../auth/AuthProvider";
import type { Address } from "../lib/types";
import { Button, ErrorText, Field, inputClass } from "./ui";

export default function AddressForm({ onSaved, onCancel }: { onSaved: (a: Address) => void; onCancel?: () => void }) {
  const { session, profile } = useAuth();
  const pincodes = useServicePincodes();
  const qc = useQueryClient();
  const [f, setF] = useState({
    label: "Home", full_name: profile?.full_name ?? "", phone: profile?.phone ?? "",
    line1: "", line2: "", landmark: "", city: "", pincode: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const active = (pincodes.data ?? []).filter((p) => p.is_active);
  const pinOk = active.some((p) => p.pincode === f.pincode);

  async function save() {
    setError("");
    if (!/^[6-9]\d{9}$/.test(f.phone)) return setError("Enter a 10-digit mobile number.");
    if (!pinOk) return setError("Sorry, we don't deliver to this pincode yet.");
    if (!f.full_name.trim() || !f.line1.trim() || !f.city.trim()) return setError("Please fill name, address and city.");
    setBusy(true);
    const { data, error } = await supabase
      .from("addresses")
      .insert({
        ...f,
        full_name: f.full_name.trim(), line1: f.line1.trim(), city: f.city.trim(),
        line2: f.line2.trim() || null, landmark: f.landmark.trim() || null,
        user_id: session!.user.id, is_default: true,
      })
      .select()
      .single();
    // remember name/phone on the profile for next time
    if (!error && profile && (!profile.full_name || !profile.phone)) {
      await supabase.from("profiles").update({ full_name: profile.full_name || f.full_name.trim(), phone: profile.phone || f.phone }).eq("id", profile.id);
    }
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await qc.invalidateQueries({ queryKey: ["addresses"] });
    onSaved(data as Address);
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name"><input className={inputClass} value={f.full_name} onChange={set("full_name")} autoComplete="name" required /></Field>
        <Field label="Mobile number"><input className={inputClass} value={f.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} autoComplete="tel-national" required /></Field>
      </div>
      <Field label="House / flat, building, street"><input className={inputClass} value={f.line1} onChange={set("line1")} autoComplete="address-line1" required /></Field>
      <Field label="Area / society (optional)"><input className={inputClass} value={f.line2} onChange={set("line2")} autoComplete="address-line2" /></Field>
      <Field label="Landmark (optional)"><input className={inputClass} value={f.landmark} onChange={set("landmark")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City"><input className={inputClass} value={f.city} onChange={set("city")} autoComplete="address-level2" required /></Field>
        <Field label="Pincode" hint={f.pincode.length === 6 ? (pinOk ? "✓ We deliver here" : "✗ Not serviceable yet") : `We deliver to ${active.map((p) => p.pincode).join(", ")}`}>
          <input className={inputClass} value={f.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} autoComplete="postal-code" required />
        </Field>
      </div>
      <Field label="Save as">
        <select className={inputClass} value={f.label} onChange={set("label")}>
          <option>Home</option><option>Work</option><option>Other</option>
        </select>
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={busy} className="flex-1">Save address</Button>
      </div>
    </form>
  );
}
