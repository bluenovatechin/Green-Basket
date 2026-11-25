import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_FIELDS, rpc } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { qty, rupees } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import { productImage } from "../../lib/images";
import type { Product, StockUnit } from "../../lib/types";
import { Button, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";
import Icon from "../../components/Icon";
import { useIsAdmin } from "./AdminLayout";
import { ADMIN_PATH } from "../../lib/base";

export function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select(PRODUCT_FIELDS).order("sort_order").order("name");
      if (error) throw error;
      return data as unknown as Product[];
    },
  });
}

const UNIT_STEP: Record<StockUnit, { label: string; factor: number }> = {
  g: { label: "kg", factor: 1000 }, ml: { label: "litres", factor: 1000 },
  piece: { label: "pieces", factor: 1 }, bunch: { label: "bunches", factor: 1 }, pack: { label: "packs", factor: 1 },
};

export default function Products() {
  const products = useAdminProducts();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "hidden">("all");
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [error, setError] = useState("");

  if (products.isLoading) return <FullPageSpinner />;
  const all = products.data ?? [];
  const isLow = (p: Product) => Number(p.stock_qty) <= Number(p.low_stock_threshold);
  const q = search.trim().toLowerCase();
  const list = all
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.name_local ?? "").toLowerCase().includes(q))
    .filter((p) => (filter === "low" ? isLow(p) : filter === "hidden" ? !p.is_active : true));

  async function toggleVisible(p: Product) {
    setError("");
    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return setError(friendlyError(error));
    await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  const tabs = [
    { key: "all", label: "All", n: all.length },
    { key: "low", label: "Low stock", n: all.filter(isLow).length },
    { key: "hidden", label: "Hidden", n: all.filter((p) => !p.is_active).length },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Products & stock</h1>
        {isAdmin && (
          <Link to={`${ADMIN_PATH}/products/new`}>
            <Button><Icon name="plus" size={18} /> New product</Button>
          </Link>
        )}
      </div>
      <input className={inputClass} placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`flex-none rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset ${filter === t.key ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line"}`}
          >
            {t.label} <span className="opacity-60">{t.n}</span>
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-line/60">
        {list.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">No products here.</p>}
        {list.map((p) => {
          const low = isLow(p);
          const img = productImage(p);
          const variants = [...p.product_variants].sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={p.id} className={`flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:p-4 ${p.is_active ? "" : "bg-surface/50"}`}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-14 flex-none overflow-hidden rounded-2xl bg-surface">
                  {img ? (
                    <img src={img} alt="" loading="lazy" className={`h-full w-full object-cover ${p.is_active ? "" : "grayscale"}`} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-muted"><Icon name="leaf" size={20} /></div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isAdmin ? (
                      <Link to={`${ADMIN_PATH}/products/${p.id}`} className="truncate font-semibold hover:text-brand">{p.name}</Link>
                    ) : (
                      <span className="truncate font-semibold">{p.name}</span>
                    )}
                    {!p.is_active && <span className="flex-none rounded-full bg-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">Hidden</span>}
                  </div>
                  <div className="truncate text-xs text-ink-muted">{p.name_local}</div>
                  <div className="mt-0.5 truncate text-xs text-ink-soft">
                    {variants.map((v, i) => (
                      <span key={v.id} className={v.is_active ? "" : "line-through opacity-60"}>
                        {i > 0 && " · "}{v.label} <b>{rupees(v.price)}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <div className={`mr-auto text-sm font-bold sm:mr-2 sm:w-28 sm:text-right ${low ? "text-amber-700" : ""}`}>
                  {qty(p.unit, p.stock_qty)}
                  {low && <span className="block text-[11px] font-semibold">Low stock</span>}
                </div>
                <Button variant="secondary" className="!h-10" onClick={() => setAdjusting(p)}>Stock</Button>
                {isAdmin && (
                  <>
                    <Link to={`${ADMIN_PATH}/products/${p.id}`}>
                      <Button variant="secondary" className="!h-10"><Icon name="edit" size={16} /> Edit</Button>
                    </Link>
                    <button
                      onClick={() => void toggleVisible(p)}
                      title={p.is_active ? "Hide from shop" : "Show in shop"}
                      className={`relative h-7 w-12 flex-none rounded-full transition ${p.is_active ? "bg-brand" : "bg-line"}`}
                      role="switch"
                      aria-checked={p.is_active}
                      aria-label="Show in shop"
                    >
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${p.is_active ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {adjusting && <StockDialog product={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

export function StockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const u = UNIT_STEP[product.unit];
  const [reason, setReason] = useState<"restock" | "wastage" | "adjustment">("restock");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const n = Number(amount);
    if (!n) return setError("Enter an amount.");
    const base = n * u.factor;
    const change = reason === "wastage" ? -Math.abs(base) : reason === "restock" ? Math.abs(base) : base;
    setBusy(true);
    try {
      await rpc("admin_adjust_stock", { p_product_id: product.id, p_change: change, p_reason: reason, p_note: note || null });
      await qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lift" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{product.name}</h2>
        <p className="text-sm">Available to sell now: <b>{qty(product.unit, product.stock_qty)}</b></p>
        <div className="grid grid-cols-3 gap-2 text-sm">
          {(["restock", "wastage", "adjustment"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`rounded-2xl px-2 py-2.5 font-semibold ring-1 ring-inset ${reason === r ? "bg-brand-light text-brand ring-brand" : "text-ink-soft ring-line"}`}
            >
              {r === "restock" ? "Add stock" : r === "wastage" ? "Wastage" : "Correction"}
            </button>
          ))}
        </div>
        <Field label={`Amount in ${u.label}`} hint={reason === "adjustment" ? "Use a minus sign to reduce, e.g. -2" : undefined}>
          <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Note (optional)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. mandi purchase" /></Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={busy} onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}
