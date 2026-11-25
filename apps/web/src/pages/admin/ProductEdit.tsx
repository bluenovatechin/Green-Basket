import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PRODUCT_FIELDS, useCategories } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import { shrinkImage } from "../../lib/image";
import { productImage } from "../../lib/images";
import { qty, rupees } from "../../lib/format";
import type { Product, StockUnit } from "../../lib/types";
import { Button, Card, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";
import Icon from "../../components/Icon";
import { ADMIN_PATH } from "../../lib/base";
import { StockDialog } from "./Products";

interface VariantDraft { id?: string; label: string; pack_qty: string; price: string; mrp: string; is_active: boolean; sort_order: number }

const UNITS: { value: StockUnit; label: string; packHint: string; short: string }[] = [
  { value: "g", label: "Weight (kg / grams)", packHint: "grams, e.g. 500 or 1000", short: "g" },
  { value: "piece", label: "Pieces", packHint: "pieces, e.g. 6", short: "pcs" },
  { value: "bunch", label: "Bunches", packHint: "bunches, e.g. 1", short: "bunch" },
  { value: "pack", label: "Packs", packHint: "packs, e.g. 1", short: "pack" },
  { value: "ml", label: "Volume (litres / ml)", packHint: "ml, e.g. 500", short: "ml" },
];

const BUCKET = "product-images";

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const categories = useCategories();
  const [loading, setLoading] = useState(!isNew);
  const [product, setProduct] = useState<Product | null>(null);
  const [p, setP] = useState({
    name: "", name_local: "", description: "", category_id: "" as string | number, unit: "g" as StockUnit,
    image_url: "" as string | null, low_stock_threshold: "0", is_active: true, sort_order: "0",
  });
  const [variants, setVariants] = useState<VariantDraft[]>([{ label: "1 kg", pack_qty: "1000", price: "", mrp: "", is_active: true, sort_order: 1 }]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stockOpen, setStockOpen] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("products").select(PRODUCT_FIELDS).eq("id", id!).single();
    if (error || !data) { setError(friendlyError(error)); setLoading(false); return; }
    const d = data as unknown as Product;
    setProduct(d);
    setP({
      name: d.name, name_local: d.name_local ?? "", description: d.description ?? "", category_id: d.category_id ?? "",
      unit: d.unit, image_url: d.image_url, low_stock_threshold: String(d.low_stock_threshold), is_active: d.is_active, sort_order: String(d.sort_order),
    });
    setVariants([...d.product_variants].sort((a, b) => a.sort_order - b.sort_order).map((v) => ({
      id: v.id, label: v.label, pack_qty: String(v.pack_qty), price: String(v.price), mrp: v.mrp ? String(v.mrp) : "", is_active: v.is_active, sort_order: v.sort_order,
    })));
    setLoading(false);
  }

  useEffect(() => {
    if (!isNew) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (loading) return <FullPageSpinner />;
  const unitInfo = UNITS.find((u) => u.value === p.unit)!;

  async function save() {
    setError("");
    if (!p.name.trim()) return setError("Name is required.");
    if (variants.length === 0) return setError("Add at least one pack size.");
    for (const v of variants) {
      if (!v.label.trim() || !(Number(v.pack_qty) > 0) || v.price === "" || !(Number(v.price) >= 0)) return setError("Each pack size needs a label, quantity and price.");
      if (v.mrp && Number(v.mrp) < Number(v.price)) return setError(`MRP can't be below the selling price (${v.label}).`);
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
      navigate(`${ADMIN_PATH}/products`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const setV = (i: number, k: keyof VariantDraft, val: string | boolean) =>
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, [k]: val } : v)));
  const moveV = (i: number, d: -1 | 1) =>
    setVariants((vs) => {
      const j = i + d;
      if (j < 0 || j >= vs.length) return vs;
      const next = [...vs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const preview = productImage({ name: p.name || "x", image_url: p.image_url });
  const firstPrice = variants.find((v) => v.is_active && v.price !== "");

  return (
    <div className="mx-auto max-w-5xl pb-28">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate(`${ADMIN_PATH}/products`)} className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-white ring-1 ring-line hover:bg-surface" aria-label="Back to products">
          <span className="text-lg">←</span>
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{isNew ? "New product" : p.name || "Edit product"}</h1>
          <p className="text-xs text-ink-muted">{isNew ? "Add a product to your shop" : p.is_active ? "Visible in the shop" : "Hidden from the shop"}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card className="space-y-4">
            <h2 className="font-semibold">Details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name (English)"><input className={inputClass} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. Tomato" /></Field>
              <Field label="Local name (Gujarati)"><input className={inputClass} value={p.name_local} onChange={(e) => setP({ ...p, name_local: e.target.value })} placeholder="e.g. ટામેટા" /></Field>
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
            </div>
            <Field label="Description (optional)" hint="Shown on the product page, e.g. where it's from or how to store it.">
              <textarea className={inputClass} rows={3} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
            </Field>
          </Card>

          <Card className="space-y-3">
            <div>
              <h2 className="font-semibold">Pack sizes & prices</h2>
              <p className="text-xs text-ink-muted">Quantity per pack in {unitInfo.packHint}. All pack sizes share the same stock. The first one is shown first in the shop.</p>
            </div>
            {variants.map((v, i) => {
              const off = v.mrp && Number(v.mrp) > Number(v.price) && Number(v.price) > 0 ? Math.round((1 - Number(v.price) / Number(v.mrp)) * 100) : 0;
              return (
                <div key={v.id ?? `new-${i}`} className={`space-y-3 rounded-2xl p-3 ring-1 ring-inset ring-line ${v.is_active ? "" : "bg-surface/60"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      Pack {i + 1}
                      {off > 0 && <span className="rounded-md bg-brand-light px-2 py-0.5 text-xs text-brand">{off}% off</span>}
                      {!v.is_active && <span className="rounded-md bg-line px-2 py-0.5 text-xs text-ink-soft">off</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="h-8 w-8 rounded-md text-ink-soft hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => moveV(i, -1)} aria-label="Move up">↑</button>
                      <button className="h-8 w-8 rounded-md text-ink-soft hover:bg-surface disabled:opacity-30" disabled={i === variants.length - 1} onClick={() => moveV(i, 1)} aria-label="Move down">↓</button>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                        aria-label="Remove pack size"
                        onClick={() => { if (v.id) setRemoved((r) => [...r, v.id!]); setVariants((vs) => vs.filter((_, j) => j !== i)); }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Label"><input className={inputClass} placeholder="500 g" value={v.label} onChange={(e) => setV(i, "label", e.target.value)} /></Field>
                    <Field label={`Quantity (${unitInfo.short})`}><input className={inputClass} placeholder="500" inputMode="decimal" value={v.pack_qty} onChange={(e) => setV(i, "pack_qty", e.target.value)} /></Field>
                    <Field label="Selling price ₹"><input className={inputClass} placeholder="40" inputMode="decimal" value={v.price} onChange={(e) => setV(i, "price", e.target.value)} /></Field>
                    <Field label="MRP ₹ (optional)"><input className={inputClass} placeholder="50" inputMode="decimal" value={v.mrp} onChange={(e) => setV(i, "mrp", e.target.value)} /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={v.is_active} onChange={(e) => setV(i, "is_active", e.target.checked)} />
                    Available to buy
                  </label>
                </div>
              );
            })}
            <Button variant="secondary" onClick={() => setVariants((vs) => [...vs, { label: "", pack_qty: "", price: "", mrp: "", is_active: true, sort_order: vs.length + 1 }])}>
              <Icon name="plus" size={16} /> Add pack size
            </Button>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <PhotoCard
            url={p.image_url}
            preview={preview}
            name={p.name}
            onChange={(url) => setP((x) => ({ ...x, image_url: url }))}
          />

          <Card className="space-y-3">
            <h2 className="font-semibold">Stock</h2>
            {isNew ? (
              <p className="text-sm text-ink-muted">Stock starts at zero. After saving, add stock from here or from the Products list.</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">Available to sell</span>
                  <b className="text-lg">{product ? qty(product.unit, product.stock_qty) : "-"}</b>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => setStockOpen(true)}>Add stock / wastage</Button>
              </>
            )}
            <Field label={`Low-stock warning at (${unitInfo.short})`} hint={p.unit === "g" ? "In grams: 5000 = 5 kg" : undefined}>
              <input className={inputClass} inputMode="decimal" value={p.low_stock_threshold} onChange={(e) => setP({ ...p, low_stock_threshold: e.target.value })} />
            </Field>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">Visibility</h2>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">
                <b className="block">Show in shop</b>
                <span className="text-xs text-ink-muted">Turn off to hide without deleting.</span>
              </span>
              <Toggle on={p.is_active} onChange={(on) => setP({ ...p, is_active: on })} />
            </label>
            <Field label="Position in list" hint="Lower numbers appear first.">
              <input className={inputClass} inputMode="numeric" value={p.sort_order} onChange={(e) => setP({ ...p, sort_order: e.target.value })} />
            </Field>
          </Card>

          <Card className="hidden lg:block">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Shop preview</div>
            <div className="overflow-hidden rounded-2xl ring-1 ring-line">
              <div className="aspect-square bg-surface">
                {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-ink-muted"><Icon name="leaf" size={32} /></div>}
              </div>
              <div className="p-3">
                <div className="truncate font-semibold">{p.name || "Product name"}</div>
                <div className="truncate text-xs text-ink-muted">{p.name_local || " "}</div>
                <div className="mt-1 text-sm"><b>{firstPrice ? rupees(Number(firstPrice.price)) : "₹ -"}</b> <span className="text-xs text-ink-muted">{firstPrice?.label}</span></div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* sticky save bar (sits above the phone's home indicator) */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64 lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <div className="min-w-0 flex-1"><ErrorText>{error}</ErrorText></div>
          <Button variant="secondary" onClick={() => navigate(`${ADMIN_PATH}/products`)}>Cancel</Button>
          <Button loading={busy} onClick={save}>{isNew ? "Create product" : "Save changes"}</Button>
        </div>
      </div>

      {stockOpen && product && (
        <StockDialog product={product} onClose={() => { setStockOpen(false); void load(); }} />
      )}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 flex-none rounded-full transition ${on ? "bg-brand" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** Photo: tap / drag & drop to upload (shrunk to WebP, stored in Supabase Storage), or paste a link. */
function PhotoCard({ url, preview, name, onChange }: { url: string | null; preview: string | null; name: string; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Please choose a photo (JPG, PNG or WebP).");
    if (file.size > 15 * 1024 * 1024) return setError("That photo is very large. Please choose one under 15 MB.");
    setUploading(true);
    try {
      const small = await shrinkImage(file); // max 800 px WebP, usually 30-80 KB
      const path = `products/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, small, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  function useLink() {
    setError("");
    try {
      const u = new URL(link.trim());
      if (u.protocol !== "https:") throw new Error();
      onChange(u.toString());
      setLink("");
      setLinkOpen(false);
    } catch {
      setError("Paste a full image link starting with https://");
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Photo</h2>
        {url && <button className="text-sm font-semibold text-red-600" onClick={() => onChange(null)}>Remove</button>}
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files?.[0]); }}
        disabled={uploading}
        className={`group relative block aspect-square w-full overflow-hidden rounded-2xl bg-surface ring-2 ring-inset transition ${dragging ? "ring-brand" : "ring-transparent hover:ring-line"}`}
      >
        {preview ? (
          <img src={preview} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 text-ink-muted">
            <Icon name="upload" size={28} />
            <span className="text-sm font-semibold">Tap to add a photo</span>
            <span className="text-xs">or drag one here</span>
          </span>
        )}
        {preview && !uploading && (
          <span className="absolute inset-x-3 bottom-3 rounded-md bg-black/60 py-2 text-center text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
            Change photo
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold text-brand">Uploading…</span>
        )}
      </button>
      {!url && preview && <p className="text-xs text-ink-muted">Showing a sample photo. Upload your own to replace it.</p>}

      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={uploading}><Icon name="upload" size={16} /> Upload</Button>
        <Button variant="secondary" onClick={() => setLinkOpen((o) => !o)}>Paste link</Button>
      </div>
      {linkOpen && (
        <div className="flex gap-2">
          <input className={inputClass} placeholder="https://…/photo.jpg" value={link} onChange={(e) => setLink(e.target.value)} />
          <Button className="flex-none" onClick={useLink} disabled={!link.trim()}>Use</Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <p className="text-xs text-ink-muted">Square photos on a plain background look best. Photos are resized automatically.</p>
    </Card>
  );
}
