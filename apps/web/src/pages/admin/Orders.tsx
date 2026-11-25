import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { rpc, useLiveOrders } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { dayLabel, rupees, time12, todayIST } from "../../lib/format";
import type { Order, OrderStatus, Slot } from "../../lib/types";
import { Card, Empty, FullPageSpinner, inputClass, StatusBadge } from "../../components/ui";
import { ADMIN_PATH } from "../../lib/base";

// Tabs follow the real workflow: new -> confirmed -> packed -> on the way -> delivered
const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "new", label: "New", statuses: ["placed"] },
  { key: "confirmed", label: "To pack", statuses: ["confirmed"] },
  { key: "packed", label: "Packed", statuses: ["packed"] },
  { key: "out", label: "On the way", statuses: ["out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled", "payment_failed"] },
  { key: "unpaid", label: "Awaiting payment", statuses: ["pending_payment"] },
  { key: "all", label: "All", statuses: [] },
];

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const date = params.get("date") ?? todayIST();
  const tabKey = params.get("tab") ?? "new";
  const slotId = params.get("slot") ?? "";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k === "date") p.delete("slot");
    setParams(p, { replace: true });
  };

  useLiveOrders("", [["admin", "orders"], ["admin", "order-counts"]]);

  const counts = useQuery({
    queryKey: ["admin", "order-counts", date],
    queryFn: () => rpc<Partial<Record<OrderStatus, number>>>("admin_order_counts", { p_date: date }),
  });
  const slots = useQuery({
    queryKey: ["admin", "slots", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_slots").select("*").eq("slot_date", date).order("start_time");
      if (error) throw error;
      return data as Slot[];
    },
  });
  const orders = useQuery({
    queryKey: ["admin", "orders", date, tab.key, slotId],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, order_number, status, payment_method, payment_status, total, address, rider_id, slot_id, created_at, delivery_slots!inner(slot_date, start_time, end_time)")
        .eq("delivery_slots.slot_date", date)
        .order("created_at");
      if (slotId) q = q.eq("slot_id", slotId);
      if (tab.statuses.length) q = q.in("status", tab.statuses);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Order[];
    },
  });

  const countFor = (t: (typeof TABS)[number]) =>
    t.statuses.length ? t.statuses.reduce((s, st) => s + (counts.data?.[st] ?? 0), 0) : Object.values(counts.data ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-ink-soft">Deliveries for <b>{dayLabel(date)}</b>. Updates live.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-full bg-white ring-1 ring-inset ring-line text-sm">
            {[["Today", todayIST()], ["Tomorrow", todayIST(1)]].map(([l, d]) => (
              <button key={d} onClick={() => set("date", d)} className={`px-3 py-2 font-medium ${date === d ? "bg-brand text-white" : "text-ink-soft"}`}>{l}</button>
            ))}
          </div>
          <input type="date" className={`${inputClass} w-auto py-2`} value={date} onChange={(e) => set("date", e.target.value)} aria-label="Delivery date" />
          <select className={`${inputClass} w-auto py-2`} value={slotId} onChange={(e) => set("slot", e.target.value)} aria-label="Slot">
            <option value="">All slots</option>
            {slots.data?.map((s) => <option key={s.id} value={s.id}>{time12(s.start_time)}–{time12(s.end_time)} ({s.booked}/{s.capacity})</option>)}
          </select>
        </div>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const n = countFor(t);
          const active = t.key === tab.key;
          return (
            <button key={t.key} onClick={() => set("tab", t.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${active ? "bg-gray-900 text-white" : "bg-white text-ink-soft hover:bg-surface"}`}>
              {t.label}
              <span className={`rounded-full px-2 text-xs ${active ? "bg-white/20" : n > 0 && (t.key === "new" || t.key === "confirmed") ? "bg-brand-accent text-ink" : "bg-surface text-ink-soft"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {orders.isLoading ? <FullPageSpinner /> : !orders.data?.length ? (
        <Card><Empty title={`No ${tab.label.toLowerCase()} orders`}>Nothing to do here for {dayLabel(date).toLowerCase()}.</Empty></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* phone: cards, desktop: table */}
          <ul className="divide-y divide-line md:hidden">
            {orders.data.map((o) => (
              <li key={o.id}>
                <Link to={`${ADMIN_PATH}/orders/${o.id}`} className="block p-4 active:bg-surface">
                  <div className="flex items-center justify-between"><b>{o.order_number}</b><StatusBadge status={o.status} /></div>
                  <div className="mt-1 text-sm">{o.address.full_name} · {o.address.line2 || o.address.line1}</div>
                  <div className="mt-1 flex justify-between text-sm text-ink-soft">
                    <span>{o.delivery_slots && `${time12(o.delivery_slots.start_time)}–${time12(o.delivery_slots.end_time)}`} · {o.payment_method === "cod" ? "COD" : "Paid online"}</span>
                    <b className="text-ink">{rupees(o.total)}</b>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Slot</th><th className="p-3">Payment</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.data.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-brand-light/40" onClick={() => navigate(`${ADMIN_PATH}/orders/${o.id}`)}>
                  <td className="p-3 font-semibold text-brand">{o.order_number}</td>
                  <td className="p-3">{o.address.full_name}<div className="text-xs text-ink-muted">{o.address.line2 || o.address.line1} · {o.address.pincode}</div></td>
                  <td className="whitespace-nowrap p-3">{o.delivery_slots && `${time12(o.delivery_slots.start_time)}–${time12(o.delivery_slots.end_time)}`}</td>
                  <td className="p-3">{o.payment_method === "cod" ? "Cash/UPI on delivery" : "Online"}{o.payment_status === "paid" && <span className="ml-1 text-brand">✓</span>}</td>
                  <td className="p-3 text-right font-semibold">{rupees(o.total)}</td>
                  <td className="p-3"><StatusBadge status={o.status} />{!o.rider_id && o.status === "packed" && <div className="mt-0.5 text-xs font-medium text-amber-700">Assign rider</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
