import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PRODUCT_FIELDS, useCategories } from "../../lib/api";
import { supabase, uploadToFunction } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import { shrinkImage } from "../../lib/image";
import type { Product, StockUnit } from "../../lib/types";
import { Button, Card, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";

interface VariantDraft { id?: string; label: string; pack_qty: string; price: string; mrp: string; is_active: boolean; sort_order: number }

const UNITS: { value: StockUnit; label: string; packHint: string }[] = [
  { value: "g", label: "Weight (grams)", packHint: "grams, e.g. 500 or 1000" },
  { value: "piece", label: "Pieces", packHint: "pieces, e.g. 6" },
  { value: "bunch", label: "Bunches", packHint: "bunches, e.g. 1" },
  { value: "pack", label: "Packs", packHint: "packs, e.g. 1" },
  { value: "ml", label: "Volume (ml)", packHint: "ml, e.g. 500" },
];

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const categories = useCategories();
  const [loading, setLoading] = useState(!isNew);
  const [p, setP] = useState({
    name: "", name_local: "", description: "", category_id: "" as string | number, unit: "g" as StockUnit,
    image_url: "" as string | null, low_stock_threshold: "0", is_active: true, sort_order: "0",
  });
  const [variants, setVariants] = useState<VariantDraft[]>([{ label: "1 kg", pack_qty: "1000", price: "", mrp: "", is_active: true, sort_order: 1 }]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    supabase.from("products").select(PRODUCT_FIELDS).eq("id", id!).single().then(({ data, error }) => {
      if (error || !data) { setError(friendlyError(error)); setLoading(false); return; }
      const d = data as unknown as Product;
      setP({
        name: d.name, name_local: d.name_local ?? "", description: d.description ?? "", category_id: d.category_id ?? "",
        unit: d.unit, image_url: d.image_url, low_stock_threshold: String(d.low_stock_threshold), is_active: d.is_active, sort_order: String(d.sort_order),
      });
      setVariants(d.product_variants.sort((a, b) => a.sort_order - b.sort_order).map((v) => ({
        id: v.id, label: v.label, pack_qty: String(v.pack_qty), price: String(v.price), mrp: v.mrp ? String(v.mrp) : "", is_active: v.is_active, sort_order: v.sort_order,
      })));
      setLoading(false);
    });
  }, [id, isNew]);

  if (loading) return <FullPageSpinner />;
  const unitInfo = UNITS.find((u) => u.value === p.unit)!;

  async function onImage(file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const small = await shrinkImage(file);
      const { url } = await uploadToFunction<{ url: string }>("product-image-upload", small, "product.webp");
      setP((x) => ({ ...x, image_url: url }));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError("");
    if (!p.name.trim()) return setError("Name is required.");
    if (variants.length === 0) return setError("Add at least one pack size.");
    for (const v of variants) {
      if (!v.label.trim() || !(Number(v.pack_qty) > 0) || !(Number(v.price) >= 0) || v.price === "") return setError("Each pack size needs a label, quantity and price.");
      if (v.mrp && Number(v.mrp) < Number(v.price)) return setError(`MRP can't be below price (${v.label}).`);
    }
    setBusy(true);
    try {
      const row = {
        name: p.name.trim(), name_local: p.name_local.trim() || null, description: p.description.trim() || null,
        category_id: p.category_id === "" ? null : Number(p.category_id), unit: p.unit, image_url: p.image_url || null,
        low_stock_threshold: Number(p.low_stock_threshold) || 0, is_active: p.is_active, sort_order: Number(p.sort_order) || 0,
      };
      let productId = id!;
      if (isNew) {
        const { data, error } = await supabase.from("products").insert(row).select("id").single();
        if (error) throw error;
        productId = data.id;
      } else {
        const { error } = await supabase.from("products").update(row).eq("id", productId);
        if (error) throw error;
      }
      for (const [i, v] of variants.entries()) {
        const vrow = {
          product_id: productId, label: v.label.trim(), pack_qty: Number(v.pack_qty), price: Number(v.price),
          mrp: v.mrp ? Number(v.mrp) : null, is_active: v.is_active, sort_order: i + 1,
        };
        const { error } = v.id
          ? await supabase.from("product_variants").update(vrow).eq("id", v.id)
          : await supabase.from("product_variants").insert(vrow);
        if (error) throw error;
      }
      for (const vid of removed) {
        // pack sizes used in past orders can't be deleted; hide them instead
        const { error } = await supabase.from("product_variants").delete().eq("id", vid);
        if (error) await supabase.from("product_variants").update({ is_active: false }).eq("id", vid);
      }
      await qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      navigate("/admin/products");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const setV = (i: number, k: keyof VariantDraft, val: string | boolean) =>
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, [k]: val } : v)));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">{isNew ? "New product" : `Edit ${p.name}`}</h1>
      <Card className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 flex-none overflow-hidden rounded-xl bg-brand-light">
            {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" />}
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Photo</span>
            <input type="file" accept="image/*" onChange={(e) => onImage(e.target.files?.[0])} disabled={uploading} />
            {uploading && <span className="block text-ink-muted">Uploading…</span>}
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name (English)"><input className={inputClass} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="Local name (Gujarati)"><input className={inputClass} value={p.name_local} onChange={(e) => setP({ ...p, name_local: e.target.value })} /></Field>
          <Field label="Category">
            <select className={inputClass} value={p.category_id} onChange={(e) => setP({ ...p, category_id: e.target.value })}>
              <option value="">None</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Stock is counted in" hint={isNew ? undefined : "Changing this after orders exist is not recommended."}>
            <select className={inputClass} value={p.unit} onChange={(e) => setP({ ...p, unit: e.target.value as StockUnit })}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </Field>
          <Field label={`Low-stock warning at (${p.unit})`}><input className={inputClass} inputMode="decimal" value={p.low_stock_threshold} onChange={(e) => setP({ ...p, low_stock_threshold: e.target.value })} /></Field>
          <Field label="Sort order"><input className={inputClass} inputMode="numeric" value={p.sort_order} onChange={(e) => setP({ ...p, sort_order: e.target.value })} /></Field>
        </div>
        <Field label="Description (optional)"><textarea className={inputClass} rows={2} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={p.is_active} onChange={(e) => setP({ ...p, is_active: e.target.checked })} /> Show in shop</label>
        {isNew && <p className="text-xs text-ink-muted">Stock starts at zero. Add stock from the Products page after saving.</p>}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Pack sizes</h2>
        <p className="text-xs text-ink-muted">Quantity per pack in {unitInfo.packHint}. All pack sizes share the same stock.</p>
        {variants.map((v, i) => (
          <div key={v.id ?? i} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-5">
            <input className={inputClass} placeholder="Label, e.g. 500 g" value={v.label} onChange={(e) => setV(i, "label", e.target.value)} />
            <input className={inputClass} placeholder={`Qty (${p.unit})`} inputMode="decimal" value={v.pack_qty} onChange={(e) => setV(i, "pack_qty", e.target.value)} />
            <input className={inputClass} placeholder="Price ₹" inputMode="decimal" value={v.price} onChange={(e) => setV(i, "price", e.target.value)} />
            <input className={inputClass} placeholder="MRP ₹ (optional)" inputMode="decimal" value={v.mrp} onChange={(e) => setV(i, "mrp", e.target.value)} />
            <div className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" className="accent-brand" checked={v.is_active} onChange={(e) => setV(i, "is_active", e.target.checked)} /> On</label>
              <button className="text-red-600" onClick={() => { if (v.id) setRemoved((r) => [...r, v.id!]); setVariants((vs) => vs.filter((_, j) => j !== i)); }}>Remove</button>
            </div>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setVariants((vs) => [...vs, { label: "", pack_qty: "", price: "", mrp: "", is_active: true, sort_order: vs.length + 1 }])}>
          + Add pack size
        </Button>
      </Card>

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => navigate("/admin/products")}>Cancel</Button>
        <Button className="flex-1" loading={busy} onClick={save}>Save product</Button>
      </div>
    </div>
  );
}
