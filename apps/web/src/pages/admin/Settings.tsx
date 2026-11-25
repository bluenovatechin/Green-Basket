import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServicePincodes, useSettings } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import type { Settings as S } from "../../lib/types";
import { Button, Card, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";

export default function Settings() {
  const settings = useSettings();
  const pincodes = useServicePincodes();
  const qc = useQueryClient();
  const [f, setF] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pin, setPin] = useState({ pincode: "", area_name: "" });

  useEffect(() => { if (settings.data) setF(settings.data); }, [settings.data]);
  if (!f) return <FullPageSpinner />;

  const num = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value as unknown as number });
  const bool = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.checked });

  async function save() {
    setError(""); setMsg(""); setBusy(true);
    const { error } = await supabase.from("settings").update({
      store_name: f!.store_name, support_email: f!.support_email || null, support_phone: f!.support_phone || null,
      min_order_value: Number(f!.min_order_value), delivery_fee: Number(f!.delivery_fee), free_delivery_above: Number(f!.free_delivery_above),
      cod_enabled: f!.cod_enabled, cod_max_amount: Number(f!.cod_max_amount), online_payment_enabled: f!.online_payment_enabled,
      payment_timeout_minutes: Number(f!.payment_timeout_minutes), max_qty_per_item: Number(f!.max_qty_per_item),
    }).eq("id", true);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setMsg("Settings saved.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function pinAction(fn: () => PromiseLike<{ error: unknown }>) {
    setError("");
    const { error } = await fn();
    if (error) return setError(friendlyError(error));
    setPin({ pincode: "", area_name: "" });
    qc.invalidateQueries({ queryKey: ["pincodes"] });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>
      <Card className="space-y-3">
        <h2 className="font-semibold">Store</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Store name"><input className={inputClass} value={f.store_name} onChange={(e) => setF({ ...f, store_name: e.target.value })} /></Field>
          <Field label="Support email"><input className={inputClass} value={f.support_email ?? ""} onChange={(e) => setF({ ...f, support_email: e.target.value })} /></Field>
          <Field label="Support phone"><input className={inputClass} value={f.support_phone ?? ""} onChange={(e) => setF({ ...f, support_phone: e.target.value })} /></Field>
        </div>
        <h2 className="pt-2 font-semibold">Order rules</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Minimum order ₹"><input className={inputClass} inputMode="decimal" value={f.min_order_value} onChange={num("min_order_value")} /></Field>
          <Field label="Delivery fee ₹"><input className={inputClass} inputMode="decimal" value={f.delivery_fee} onChange={num("delivery_fee")} /></Field>
          <Field label="Free delivery above ₹"><input className={inputClass} inputMode="decimal" value={f.free_delivery_above} onChange={num("free_delivery_above")} /></Field>
          <Field label="Max of one item per order"><input className={inputClass} inputMode="numeric" value={f.max_qty_per_item} onChange={num("max_qty_per_item")} /></Field>
          <Field label="Time to pay online (minutes)" hint="Stock is held this long"><input className={inputClass} inputMode="numeric" value={f.payment_timeout_minutes} onChange={num("payment_timeout_minutes")} /></Field>
          <Field label="Cash on delivery up to ₹"><input className={inputClass} inputMode="decimal" value={f.cod_max_amount} onChange={num("cod_max_amount")} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={f.online_payment_enabled} onChange={bool("online_payment_enabled")} /> Accept online payment (PhonePe)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={f.cod_enabled} onChange={bool("cod_enabled")} /> Accept cash / UPI on delivery</label>
        <ErrorText>{error}</ErrorText>
        {msg && <p className="text-sm text-brand">{msg}</p>}
        <Button loading={busy} onClick={save}>Save settings</Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Delivery pincodes</h2>
        <ul className="divide-y divide-line text-sm">
          {pincodes.data?.map((p) => (
            <li key={p.pincode} className={`flex items-center justify-between py-2 ${p.is_active ? "" : "opacity-50"}`}>
              <span><b>{p.pincode}</b> · {p.area_name}</span>
              <button className="text-brand" onClick={() => pinAction(() => supabase.from("service_pincodes").update({ is_active: !p.is_active }).eq("pincode", p.pincode))}>
                {p.is_active ? "Pause" : "Resume"}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className={inputClass} placeholder="Pincode" inputMode="numeric" maxLength={6} value={pin.pincode} onChange={(e) => setPin({ ...pin, pincode: e.target.value })} />
          <input className={inputClass} placeholder="Area name" value={pin.area_name} onChange={(e) => setPin({ ...pin, area_name: e.target.value })} />
          <Button onClick={() => pinAction(() => supabase.from("service_pincodes").insert(pin))} disabled={!/^[1-9]\d{5}$/.test(pin.pincode) || !pin.area_name}>Add</Button>
        </div>
      </Card>
    </div>
  );
}
