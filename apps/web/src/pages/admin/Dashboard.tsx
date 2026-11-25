import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { rpc, useLiveOrders } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { dayLabel, qty, rupees, todayIST } from "../../lib/format";
import type { OrderStatus, Product } from "../../lib/types";
import { Card, FullPageSpinner } from "../../components/ui";
import { useAuth } from "../../auth/AuthProvider";
import Icon, { type IconName } from "../../components/Icon";
import { ADMIN_PATH } from "../../lib/base";
import { useIsAdmin } from "./AdminLayout";

interface Summary {
  by_status: Partial<Record<OrderStatus, number>>;
  low_stock: number;
  // admins only: the database leaves these out for packers
  delivered_revenue?: number;
  cod_collected?: { rider: string | null; via: string; amount: number }[];
  open_refunds?: number;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const isAdmin = useIsAdmin();
  const [date, setDate] = useState(todayIST());
  useLiveOrders("", [["admin", "dashboard"], ["admin", "unassigned"]]);

  const summary = useQuery({
    queryKey: ["admin", "dashboard", date],
    queryFn: () => rpc<Summary>("dashboard_summary", { p_date: date }),
    refetchInterval: isAdmin ? 60_000 : 20_000, // packers don't get live order events
  });
  const lowStock = useQuery({
    queryKey: ["admin", "low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, stock_qty, low_stock_threshold").eq("is_active", true);
      if (error) throw error;
      return (data as Product[]).filter((p) => Number(p.stock_qty) <= Number(p.low_stock_threshold));
    },
  });
  const unassigned = useQuery({
    queryKey: ["admin", "unassigned", date],
    queryFn: async () => {
      const packed = await rpc<{ rider_id: string | null }[]>("staff_orders", { p_date: date, p_statuses: ["packed"] });
      return packed.filter((o) => !o.rider_id).length;
    },
  });

  if (summary.isLoading) return <FullPageSpinner />;
  const s = summary.data;
  const n = (st: OrderStatus) => s?.by_status?.[st] ?? 0;
  const ordersUrl = (tab: string) => `${ADMIN_PATH}/orders?date=${date}&tab=${tab}`;
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const todo = [
    n("placed") > 0 && { text: `${n("placed")} new order${n("placed") > 1 ? "s" : ""} to confirm`, to: ordersUrl("new"), tone: "brand" },
    n("confirmed") > 0 && { text: `${n("confirmed")} order${n("confirmed") > 1 ? "s" : ""} to pack`, to: ordersUrl("confirmed"), tone: "brand" },
    (unassigned.data ?? 0) > 0 && { text: `${unassigned.data} packed order${unassigned.data! > 1 ? "s" : ""} need a rider`, to: ordersUrl("packed"), tone: "amber" },
    (lowStock.data?.length ?? 0) > 0 && { text: `${lowStock.data!.length} product${lowStock.data!.length > 1 ? "s" : ""} low on stock`, to: `${ADMIN_PATH}/products`, tone: "amber" },
    isAdmin && (s?.open_refunds ?? 0) > 0 && { text: `${s!.open_refunds} refund${s!.open_refunds! > 1 ? "s" : ""} open`, to: ordersUrl("cancelled"), tone: "red" },
  ].filter(Boolean) as { text: string; to: string; tone: string }[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">{greet}{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
          <p className="text-sm text-ink-soft">Here's how deliveries for <b>{dayLabel(date)}</b> are going.</p>
        </div>
        <div className="flex overflow-hidden rounded-md bg-white ring-1 ring-inset ring-line text-sm">
          {[["Today", todayIST()], ["Tomorrow", todayIST(1)]].map(([l, d]) => (
            <button key={d} onClick={() => setDate(d)} className={`px-3 py-2 font-medium ${date === d ? "bg-brand text-white" : "text-ink-soft"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="New" value={n("placed")} to={ordersUrl("new")} accent={n("placed") > 0} />
        <Stat label="To pack" value={n("confirmed")} to={ordersUrl("confirmed")} accent={n("confirmed") > 0} />
        <Stat label="Packed" value={n("packed")} to={ordersUrl("packed")} />
        <Stat label="On the way" value={n("out_for_delivery")} to={ordersUrl("out")} />
        <Stat label="Delivered" value={n("delivered")} to={ordersUrl("delivered")} />
      </div>

      <div className={`grid gap-4 ${isAdmin ? "lg:grid-cols-3" : ""}`}>
        <Card className={isAdmin ? "lg:col-span-2" : ""}>
          <h2 className="mb-3 font-semibold">Needs your attention</h2>
          {todo.length === 0 ? (
            <p className="rounded-xl bg-brand-light p-4 text-sm font-medium text-brand">✓ All caught up. Nothing waiting.</p>
          ) : (
            <ul className="space-y-2">
              {todo.map((t) => (
                <li key={t.text}>
                  <Link to={t.to} className={`flex items-center justify-between rounded-xl border p-3 text-sm font-medium hover:shadow-sm ${t.tone === "brand" ? "border-brand/30 bg-brand-light/60" : t.tone === "amber" ? "border-amber-300 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                    {t.text}<span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Quick to={`${ADMIN_PATH}/orders`} icon="package" label="Orders" />
            <Quick to={`${ADMIN_PATH}/procurement`} icon="cart" label="Buying list" />
            <Quick to={`${ADMIN_PATH}/products`} icon="upload" label="Add stock" />
            {isAdmin ? <Quick to={`${ADMIN_PATH}/prices`} icon="tag" label="Update prices" /> : null}
          </div>
        </Card>

        {isAdmin && <Card>
          <h2 className="mb-1 font-semibold">Money</h2>
          <div className="text-3xl font-bold">{rupees(s?.delivered_revenue)}</div>
          <p className="mb-3 text-xs text-ink-muted">from delivered orders</p>
          <h3 className="mb-1 text-sm font-semibold text-ink-soft">Collected by riders</h3>
          {s?.cod_collected?.length ? (
            <ul className="space-y-1 text-sm">
              {s.cod_collected.map((c, i) => (
                <li key={i} className="flex justify-between"><span>{c.rider ?? "Unassigned"} · {c.via === "upi_qr" ? "UPI" : "Cash"}</span><b>{rupees(c.amount)}</b></li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-muted">Nothing collected yet.</p>}
        </Card>}
      </div>

      {!!lowStock.data?.length && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Low stock</h2>
            <Link to={`${ADMIN_PATH}/products`} className="text-sm font-medium text-brand">Add stock →</Link>
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {lowStock.data.map((p) => (
              <li key={p.id} className="flex justify-between rounded-lg bg-amber-50 px-3 py-2"><span>{p.name}</span><b>{qty(p.unit, p.stock_qty)}</b></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, to, accent }: { label: string; value: number; to: string; accent?: boolean }) {
  return (
    <Link to={to} className={`rounded-2xl p-4 transition hover:shadow-md ${accent ? "bg-brand text-white" : "bg-white"}`}>
      <div className={`text-sm ${accent ? "text-white/80" : "text-ink-muted"}`}>{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </Link>
  );
}

function Quick({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1 rounded-xl border border-line p-3 text-center text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand">
      <Icon name={icon} size={22} />{label}
    </Link>
  );
}
