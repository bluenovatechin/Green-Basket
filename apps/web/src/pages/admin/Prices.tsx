import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { rupees } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import { Button, ErrorText, FullPageSpinner } from "../../components/ui";
import { useAdminProducts } from "./Products";

// Mandi prices change every morning. Edit every price on one screen and save once.
export default function Prices() {
  const products = useAdminProducts();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  if (products.isLoading) return <FullPageSpinner />;
  const changed = Object.entries(edits).filter(([, v]) => v !== "");

  async function saveAll() {
    setError(""); setSaved("");
    for (const [, v] of changed) if (!(Number(v) >= 0)) return setError("Prices must be numbers.");
    setBusy(true);
    try {
      for (const [id, v] of changed) {
        const variant = products.data!.flatMap((p) => p.product_variants).find((x) => x.id === id)!;
        // keep MRP valid: if the new price is above MRP, raise MRP to match
        const mrp = variant.mrp !== null && Number(v) > Number(variant.mrp) ? Number(v) : variant.mrp;
        const { error } = await supabase.from("product_variants").update({ price: Number(v), mrp }).eq("id", id);
        if (error) throw error;
      }
      setSaved(`${changed.length} price(s) updated.`);
      setEdits({});
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <h1 className="text-xl font-bold">Today's prices</h1>
      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600"><tr><th className="p-3">Product</th><th className="p-3">Pack</th><th className="p-3">Current</th><th className="p-3">New price ₹</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {products.data!.filter((p) => p.is_active).flatMap((p) =>
              p.product_variants.filter((v) => v.is_active).sort((a, b) => a.sort_order - b.sort_order).map((v, i) => (
                <tr key={v.id}>
                  <td className="p-3 font-medium">{i === 0 ? p.name : ""}</td>
                  <td className="p-3">{v.label}</td>
                  <td className="p-3">{rupees(v.price)}</td>
                  <td className="p-3">
                    <input inputMode="decimal" className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
                      placeholder={String(v.price)} value={edits[v.id] ?? ""} onChange={(e) => setEdits({ ...edits, [v.id]: e.target.value })} />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white p-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="text-sm">{saved || <ErrorText>{error}</ErrorText> || `${changed.length} change(s)`}</div>
          <Button loading={busy} disabled={changed.length === 0} onClick={saveAll}>Save {changed.length || ""} price{changed.length === 1 ? "" : "s"}</Button>
        </div>
      </div>
    </div>
  );
}
