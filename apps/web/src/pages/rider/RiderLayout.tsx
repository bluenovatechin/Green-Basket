import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountMenu, Logo } from "../../components/CustomerLayout";
import Icon, { type IconName } from "../../components/Icon";
import { rpc } from "../../lib/api";
import { usePrivatePage } from "../../lib/seo";
import type { OrderStatus, PaymentMethod } from "../../lib/types";

/** What a rider receives: their own deliveries, no prices; collect_amount only on unpaid cash orders. */
export interface RiderOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  is_paid: boolean;
  collect_amount: number | null;
  cod_collected_via: string | null;
  address: { full_name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; pincode: string };
  customer_note: string | null;
  created_at: string;
  delivered_at: string | null;
  delivery_slots: { slot_date: string; start_time: string; end_time: string };
  order_items: { id: string; product_name: string; variant_label: string; quantity: number }[];
}

export function useRiderOrders(scope: "active" | "done") {
  return useQuery({
    queryKey: ["rider", "orders", scope],
    queryFn: () => rpc<RiderOrder[]>("rider_orders", { p_scope: scope }),
    refetchInterval: scope === "active" ? 15_000 : 60_000,
    refetchOnWindowFocus: true,
  });
}

export default function RiderLayout() {
  usePrivatePage("Rider Deliveries");
  const location = useLocation();
  const active = useRiderOrders("active");
  const count = active.data?.length ?? 0;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-surface pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <Logo to="/rider" />
            <span className="rounded-md bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Rider</span>
          </div>
          <nav aria-label="Rider" className="hidden items-center gap-1 md:flex">
            <TopLink to="/rider" end label="Deliveries" badge={count} />
            <TopLink to="/rider/done" label="Completed" />
          </nav>
          <AccountMenu />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      <nav aria-label="Rider sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-3">
          <Tab to="/rider" end icon="bike" label="Deliveries" badge={count} />
          <Tab to="/rider/done" icon="check" label="Completed" />
          <Tab to="/account" icon="user" label="Account" />
        </div>
      </nav>
    </div>
  );
}

function TopLink({ to, label, end, badge }: { to: string; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ${isActive ? "bg-ink text-white" : "text-ink-soft hover:bg-paper"}`}
    >
      {label}
      {!!badge && <span className="tabular rounded bg-brand-accent px-1.5 text-[11px] font-bold text-white">{badge}</span>}
    </NavLink>
  );
}

function Tab({ to, icon, label, badge, end }: { to: string; icon: IconName; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? "text-brand before:absolute before:inset-x-8 before:top-0 before:h-0.5 before:bg-brand" : "text-ink-muted"}`}>
      <span className="relative">
        <Icon name={icon} size={22} />
        {!!badge && <span className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-brand-accent px-1 text-[10px] font-bold text-white">{badge}</span>}
      </span>
      {label}
    </NavLink>
  );
}
