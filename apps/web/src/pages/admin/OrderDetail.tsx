import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import OrderTracker from "../../components/OrderTracker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc, useOrder } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { dateTime, qty, rupees, slotLabel, STATUS_LABEL } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import type { OrderStatus, Profile } from "../../lib/types";
import { Button, Card, ErrorText, FullPageSpinner, inputClass, StatusBadge } from "../../components/ui";
import { useIsAdmin } from "./AdminLayout";

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }[]>> = {
  placed: [{ to: "confirmed", label: "Confirm" }, { to: "packed", label: "Mark packed" }],
  confirmed: [{ to: "packed", label: "Mark packed" }],
  packed: [{ to: "out_for_delivery", label: "Send out for delivery" }],
  out_for_delivery: [{ to: "packed", label: "Delivery failed: back to store" }],
};

export default function AdminOrderDetail() {
  const { id } = useParams();
  const order = useOrder(id);
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const riders = useQuery({
    queryKey: ["admin", "riders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, role").eq("role", "rider").eq("is_blocked", false);
      if (error) throw error;
      return data as Profile[];
    },
  });

  if (order.isLoading || !order.data) return <FullPageSpinner />;
  const o = order.data;

  async function run(key: string, fn: () => Promise<unknown>) {
    setError("");
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["order", o.id] });
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const editable = o.status === "placed" || o.status === "confirmed";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/admin/orders"))} className="text-sm font-medium text-gray-600">← Back to orders</button>
        <Button variant="secondary" onClick={() => window.print()}>Print packing slip</Button>
      </div>

      <div className="print-area grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="no-print"><OrderTracker order={o} /></div>
          <Card className="print-area">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-bold">{o.order_number}</h1>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-1 text-sm"><b>Slot:</b> {slotLabel(o.delivery_slots)}</p>
            <p className="text-sm">
              <b>{o.address.full_name}</b> · <a href={`tel:${o.address.phone}`} className="text-brand">{o.address.phone}</a><br />
              {o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ""}{o.address.landmark ? `, near ${o.address.landmark}` : ""}, {o.address.city} {o.address.pincode}
            </p>
            {o.customer_note && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-sm">Note: {o.customer_note}</p>}
            <p className="mt-1 text-sm"><b>Payment:</b> {o.payment_method === "cod" ? `Collect ${rupees(o.total)} (cash/UPI)` : "Paid online"} · {o.payment_status}</p>

            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-gray-500"><tr><th className="py-1">Item</th><th>Qty</th><th className="text-right">Amount</th><th className="no-print" /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {o.order_items?.map((i) => (
                  <tr key={i.id} className={i.is_unavailable ? "text-gray-400 line-through" : ""}>
                    <td className="py-2">{i.product_name} · {i.variant_label}</td>
                    <td>{i.quantity} <span className="text-xs text-gray-500">({qty(i.unit, i.pack_qty * i.quantity)})</span></td>
                    <td className="text-right">{rupees(i.line_total)}</td>
                    <td className="no-print pl-2 text-right">
                      {editable && !i.is_unavailable && (
                        <button className="text-xs text-red-600" disabled={busy !== null}
                          onClick={() => confirm(`Mark ${i.product_name} unavailable? The customer is told and refunded if prepaid.`) &&
                            run("item" + i.id, () => rpc("mark_item_unavailable", { p_item_id: i.id }))}>
                          Unavailable
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-right text-sm">
              Items {rupees(o.subtotal)} · Delivery {rupees(o.delivery_fee)} · <b>Total {rupees(o.total)}</b>
              {Number(o.refunded_amount) > 0 && <div className="text-sky-700">Refunded/refunding {rupees(o.refunded_amount)}</div>}
            </div>
          </Card>
        </div>

        <div className="no-print space-y-4">
          <Card className="space-y-2">
            <h2 className="font-semibold">Actions</h2>
            {(NEXT[o.status] ?? []).map((n) => (
              <Button key={n.to} className="w-full" variant={n.to === "packed" && o.status === "out_for_delivery" ? "secondary" : "primary"}
                loading={busy === n.to} onClick={() => run(n.to, () => rpc("set_order_status", { p_order_id: o.id, p_status: n.to, p_note: null }))}>
                {n.label}
              </Button>
            ))}
            {isAdmin && o.status === "out_for_delivery" && (
              <>
                <Button className="w-full" loading={busy === "d1"} onClick={() => run("d1", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: o.payment_method === "cod" ? "cash" : null }))}>
                  Delivered{o.payment_method === "cod" ? " (cash)" : ""}
                </Button>
                {o.payment_method === "cod" && (
                  <Button className="w-full" variant="secondary" loading={busy === "d2"} onClick={() => run("d2", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: "upi_qr" }))}>
                    Delivered (UPI QR)
                  </Button>
                )}
              </>
            )}

            {["placed", "confirmed", "packed"].includes(o.status) && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Rider</span>
                <select className={inputClass} value={o.rider_id ?? ""} disabled={busy !== null}
                  onChange={(e) => run("rider", () => rpc("assign_rider", { p_order_id: o.id, p_rider_id: e.target.value || null }))}>
                  <option value="">Not assigned</option>
                  {riders.data?.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
                </select>
              </label>
            )}

            {isAdmin && ["pending_payment", "placed", "confirmed", "packed", "out_for_delivery"].includes(o.status) && (
              <Button variant="danger" className="w-full" loading={busy === "cancel"}
                onClick={() => {
                  const reason = prompt("Reason for cancelling (sent to the customer):", "Unable to deliver");
                  if (reason !== null) void run("cancel", () => rpc("cancel_order", { p_order_id: o.id, p_reason: reason }));
                }}>
                Cancel order
              </Button>
            )}
            <ErrorText>{error}</ErrorText>
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">History</h2>
            <ul className="space-y-1 text-sm">
              {o.order_events?.map((e) => (
                <li key={e.id}><b>{STATUS_LABEL[e.to_status]}</b>{e.note ? ` – ${e.note}` : ""}<div className="text-xs text-gray-500">{dateTime(e.created_at)}</div></li>
              ))}
            </ul>
          </Card>

          {!!o.refunds?.length && (
            <Card>
              <h2 className="mb-2 font-semibold">Refunds</h2>
              <ul className="space-y-1 text-sm">
                {o.refunds.map((r) => (
                  <li key={r.id}>{rupees(r.amount)} · {r.reason} · <b className={r.status === "failed" ? "text-red-600" : ""}>{r.status}</b></li>
                ))}
              </ul>
              {o.refunds.some((r) => r.status === "failed") && (
                <p className="mt-2 text-xs text-red-700">A refund failed after 5 tries. Refund it manually from the PhonePe dashboard.</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
