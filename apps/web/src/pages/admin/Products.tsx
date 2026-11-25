import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_FIELDS, rpc } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { qty, rupees } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import type { Product, StockUnit } from "../../lib/types";
import { Button, Card, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";
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
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  if (products.isLoading) return <FullPageSpinner />;
  const list = (products.data ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Products & stock</h1>
        {isAdmin && <Link to={`${ADMIN_PATH}/products/new`}><Button>+ New product</Button></Link>}
      </div>
      <input className={inputClass} placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-ink-soft">
            <tr><th className="p-3">Product</th><th className="p-3">Pack sizes & prices</th><th className="p-3 text-right">Available to sell</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((p) => {
              const low = Number(p.stock_qty) <= Number(p.low_stock_threshold);
              return (
                <tr key={p.id} className={p.is_active ? "" : "opacity-50"}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {p.image_url ? <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-brand-light" />}
                      <div>
                        {isAdmin ? <Link to={`${ADMIN_PATH}/products/${p.id}`} className="font-semibold text-brand">{p.name}</Link> : <span className="font-semibold">{p.name}</span>}
                        {!p.is_active && <span className="ml-1 text-xs">(hidden)</span>}
                        <div className="text-xs text-ink-muted">{p.name_local}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {p.product_variants.sort((a, b) => a.sort_order - b.sort_order).map((v) => (
                      <div key={v.id} className={v.is_active ? "" : "line-through opacity-60"}>{v.label}: <b>{rupees(v.price)}</b></div>
                    ))}
                  </td>
                  <td className={`p-3 text-right font-bold ${low ? "text-amber-700" : ""}`}>{qty(p.unit, p.stock_qty)}</td>
                  <td className="p-3 text-right"><Button variant="secondary" onClick={() => setAdjusting(p)}>Stock</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adjusting && <StockDialog product={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function StockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <Card className="w-full max-w-sm space-y-3">
        <h2 className="text-lg font-bold">{product.name}</h2>
        <p className="text-sm">Available to sell now: <b>{qty(product.unit, product.stock_qty)}</b></p>
        <div className="grid grid-cols-3 gap-1 text-sm">
          {(["restock", "wastage", "adjustment"] as const).map((r) => (
            <button key={r} onClick={() => setReason(r)} className={`rounded-lg border px-2 py-2 ${reason === r ? "border-brand bg-brand-light font-semibold text-brand" : "border-line"}`}>
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
      </Card>
    </div>
  );
}
