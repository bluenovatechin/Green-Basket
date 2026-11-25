import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useMyOrders } from "../lib/api";
import { slotLabel, STATUS_LABEL } from "../lib/format";
import Icon from "./Icon";

const ACTIVE = ["pending_payment", "placed", "confirmed", "packed", "out_for_delivery"];

/** "Your order is on the way – Track" strip on the home page. */
export default function ActiveOrderBanner() {
  const { session } = useAuth();
  const orders = useMyOrders(Boolean(session));
  const active = orders.data?.filter((o) => ACTIVE.includes(o.status)) ?? [];
  if (active.length === 0) return null;
  const o = active[0];
  return (
    <Link to={`/orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-3xl bg-ink p-3 pr-5 text-white shadow-lift">
      <span className="flex items-center gap-3">
        <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
          <Icon name={o.status === "out_for_delivery" ? "bike" : o.status === "pending_payment" ? "wallet" : "package"} size={20} />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-brand-accent" />
        </span>
        <span>
          <span className="block text-sm font-bold">{STATUS_LABEL[o.status]}{active.length > 1 ? ` · +${active.length - 1} more` : ""}</span>
          <span className="block text-xs text-white/70">{o.order_number} · {slotLabel(o.delivery_slots)}</span>
        </span>
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold">Track <Icon name="arrowRight" size={16} /></span>
    </Link>
  );
}
