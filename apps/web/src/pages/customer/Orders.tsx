import { Link } from "react-router-dom";
import { useMyOrders } from "../../lib/api";
import { dateTime, rupees, slotLabel } from "../../lib/format";
import type { Order } from "../../lib/types";
import { Button, Empty, FullPageSpinner, StatusBadge } from "../../components/ui";

const ACTIVE = ["pending_payment", "placed", "confirmed", "packed", "out_for_delivery"];

export default function Orders() {
  const { data, isLoading } = useMyOrders();
  if (isLoading) return <FullPageSpinner />;
  if (!data?.length) {
    return (
      <Empty title="No orders yet">
        <p className="mb-4">Your fresh basket is just a few taps away.</p>
        <Link to="/"><Button>Start shopping</Button></Link>
      </Empty>
    );
  }
  const active = data.filter((o) => ACTIVE.includes(o.status));
  const past = data.filter((o) => !ACTIVE.includes(o.status));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-bold">My orders</h1>
      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">In progress</h2>
          {active.map((o) => <OrderRow key={o.id} o={o} highlight />)}
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Past orders</h2>
          {past.map((o) => <OrderRow key={o.id} o={o} />)}
        </section>
      )}
    </div>
  );
}

function OrderRow({ o, highlight }: { o: Order; highlight?: boolean }) {
  return (
    <Link
      to={`/orders/${o.id}`}
      className={`flex items-center justify-between gap-3 rounded-2xl border bg-white p-4 transition hover:shadow-sm ${highlight ? "border-brand/40" : "border-gray-200"}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{o.order_number}</span>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-1 truncate text-sm text-gray-600">🛵 {slotLabel(o.delivery_slots)}</div>
        <div className="text-xs text-gray-400">Ordered {dateTime(o.created_at)}</div>
      </div>
      <div className="text-right">
        <div className="font-bold">{rupees(o.total)}</div>
        <div className="text-sm font-semibold text-brand">{highlight ? "Track →" : "View →"}</div>
      </div>
    </Link>
  );
}
