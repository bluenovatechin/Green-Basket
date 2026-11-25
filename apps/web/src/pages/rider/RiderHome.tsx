import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { rupees, slotLabel, todayIST } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import type { Order } from "../../lib/types";
import { Button, Card, Empty, ErrorText, FullPageSpinner, StatusBadge } from "../../components/ui";

// Simple phone screen for riders: today's assigned orders, call / map, start and complete delivery.
export default function RiderHome() {
  const { profile, signOut } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const orders = useQuery({
    queryKey: ["rider", "orders"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, delivery_slots!inner(slot_date, start_time, end_time), order_items(id, product_name, variant_label, quantity, is_unavailable)")
        .eq("rider_id", profile!.id)
        .in("status", ["packed", "out_for_delivery", "confirmed", "placed"])
        .gte("delivery_slots.slot_date", todayIST(-1))
        .order("created_at");
      if (error) throw error;
      return data as unknown as Order[];
    },
  });

  async function act(key: string, fn: () => Promise<unknown>) {
    setError("");
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["rider"] });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand px-4 py-3 text-white">
        <span className="font-bold">My deliveries</span>
        <span className="space-x-3 text-sm">
          {profile?.role === "admin" && <Link to="/admin" className="underline">Admin</Link>}
          <button onClick={signOut} className="underline">Log out</button>
        </span>
      </header>
      <main className="space-y-3 p-4">
        <ErrorText>{error}</ErrorText>
        {orders.isLoading ? <FullPageSpinner /> : !orders.data?.length ? <Empty title="No deliveries assigned">New orders appear here automatically.</Empty> : (
          orders.data.map((o) => {
            const a = o.address;
            const mapQuery = encodeURIComponent(`${a.line1} ${a.line2 ?? ""} ${a.landmark ?? ""} ${a.city} ${a.pincode}`);
            const collect = o.payment_method === "cod" && o.payment_status !== "paid";
            return (
              <Card key={o.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <b>{o.order_number}</b>
                  <StatusBadge status={o.status} />
                </div>
                <div className="text-sm text-gray-600">{slotLabel(o.delivery_slots)}</div>
                <div className="text-sm">
                  <b>{a.full_name}</b><br />
                  {a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.landmark ? `, near ${a.landmark}` : ""}, {a.pincode}
                </div>
                {o.customer_note && <div className="rounded-lg bg-amber-50 p-2 text-sm">Note: {o.customer_note}</div>}
                <div className={`rounded-lg p-2 text-center font-bold ${collect ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}>
                  {collect ? `Collect ${rupees(o.total)}` : "Already paid"}
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-600">{o.order_items?.filter((i) => !i.is_unavailable).length} items</summary>
                  <ul className="mt-1 list-inside list-disc">
                    {o.order_items?.filter((i) => !i.is_unavailable).map((i) => <li key={i.id}>{i.product_name} {i.variant_label} × {i.quantity}</li>)}
                  </ul>
                </details>
                <div className="grid grid-cols-2 gap-2">
                  <a href={`tel:${a.phone}`} className="rounded-xl border border-gray-300 bg-white py-2.5 text-center font-semibold">📞 Call</a>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-300 bg-white py-2.5 text-center font-semibold">🗺️ Map</a>
                </div>
                {o.status === "packed" && (
                  <Button className="w-full" loading={busy === o.id} onClick={() => act(o.id, () => rpc("set_order_status", { p_order_id: o.id, p_status: "out_for_delivery", p_note: null }))}>
                    Start delivery
                  </Button>
                )}
                {o.status === "out_for_delivery" && (collect ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button loading={busy === o.id + "c"} onClick={() => act(o.id + "c", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: "cash" }))}>Delivered · Cash</Button>
                    <Button loading={busy === o.id + "u"} onClick={() => act(o.id + "u", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: "upi_qr" }))}>Delivered · UPI</Button>
                  </div>
                ) : (
                  <Button className="w-full" loading={busy === o.id + "d"} onClick={() => act(o.id + "d", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: null }))}>Delivered</Button>
                ))}
                {(o.status === "placed" || o.status === "confirmed") && <p className="text-center text-sm text-gray-500">Waiting to be packed</p>}
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
}
