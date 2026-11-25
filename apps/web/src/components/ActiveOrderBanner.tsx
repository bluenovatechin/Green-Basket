import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useMyOrders } from "../lib/api";
import { slotLabel, STATUS_LABEL } from "../lib/format";

const ACTIVE = ["pending_payment", "placed", "confirmed", "packed", "out_for_delivery"];

/** "Your order is on the way – Track" strip on the home page. */
export default function ActiveOrderBanner() {
  const { session } = useAuth();
  const orders = useMyOrders(Boolean(session));
  const active = orders.data?.filter((o) => ACTIVE.includes(o.status)) ?? [];
  if (active.length === 0) return null;
  const o = active[0];
  return (
    <Link to={`/orders/${o.id}`} className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand-light p-3">
      <span className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>{o.status === "out_for_delivery" ? "🛵" : o.status === "pending_payment" ? "💳" : "📦"}</span>
        <span>
          <span className="block text-sm font-bold text-brand">{STATUS_LABEL[o.status]}{active.length > 1 ? ` · +${active.length - 1} more` : ""}</span>
          <span className="block text-xs text-gray-600">Order {o.order_number} · {slotLabel(o.delivery_slots)}</span>
        </span>
      </span>
      <span className="whitespace-nowrap text-sm font-semibold text-brand">Track →</span>
    </Link>
  );
}
