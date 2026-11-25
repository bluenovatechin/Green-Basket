import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { rupees, time12 } from "../../lib/format";
import Icon from "../../components/Icon";
import { Empty, ErrorText, FullPageSpinner, StatusBadge } from "../../components/ui";
import { friendlyError } from "../../lib/errors";
import { useRiderOrders, type RiderOrder } from "./RiderLayout";

// Rider's main screen: deliveries grouped by what to do next. Tap one to open it.
export default function RiderHome() {
  const { profile } = useAuth();
  const orders = useRiderOrders("active");

  if (orders.isLoading) return <FullPageSpinner />;
  const list = orders.data ?? [];
  const groups: { title: string; hint: string; items: RiderOrder[] }[] = [
    { title: "On the way", hint: "Mark these delivered at the door", items: list.filter((o) => o.status === "out_for_delivery") },
    { title: "Ready to pick up", hint: "Packed and waiting at the store", items: list.filter((o) => o.status === "packed") },
    { title: "Being packed", hint: "Not ready yet", items: list.filter((o) => o.status === "placed" || o.status === "confirmed") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-2xl">Hi{profile?.full_name ? ` ${profile.full_name.split(" ")[0]}` : ""}, your deliveries</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {list.length ? `${list.length} assigned to you · refreshes automatically` : "New deliveries appear here automatically."}
        </p>
      </div>

      {orders.error && <ErrorText>{friendlyError(orders.error)}</ErrorText>}

      {list.length === 0 ? (
        <div className="rounded-2xl bg-paper shadow-soft ring-1 ring-line/70">
          <Empty title="No deliveries right now" icon="bike">
            When the store assigns you an order it shows up here. <Link to="/rider/done" className="font-semibold text-brand underline">See completed deliveries</Link>
          </Empty>
        </div>
      ) : (
        groups.filter((g) => g.items.length).map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 id={`g-${g.title}`} className="text-base font-bold">{g.title} <span className="text-ink-muted">({g.items.length})</span></h2>
              <span className="text-xs text-ink-muted">{g.hint}</span>
            </div>
            <ul className="space-y-3">
              {g.items.map((o) => <li key={o.id}><DeliveryRow o={o} /></li>)}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function DeliveryRow({ o, done = false }: { o: RiderOrder; done?: boolean }) {
  const a = o.address;
  return (
    <Link to={`/rider/${o.id}`} className="block rounded-2xl bg-paper p-4 shadow-soft ring-1 ring-line/70 transition hover:shadow-lift active:bg-surface">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{o.order_number}</span>
        <StatusBadge status={o.status} />
      </div>
      <div className="mt-2 flex items-start gap-2 text-sm">
        <Icon name="pin" size={16} className="mt-0.5 flex-none text-brand" />
        <span className="min-w-0">
          <span className="block font-semibold">{a.full_name}</span>
          <span className="block truncate text-ink-soft">{a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.landmark ? `, near ${a.landmark}` : ""}</span>
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-ink-soft">
          <Icon name="clock" size={15} />
          {done && o.delivered_at
            ? `Delivered ${new Date(o.delivered_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
            : `${time12(o.delivery_slots.start_time)}–${time12(o.delivery_slots.end_time)}`}
        </span>
        <CollectPill o={o} />
      </div>
    </Link>
  );
}

/** The only money a rider ever sees: the exact amount to collect on an unpaid cash-on-delivery order. */
export function CollectPill({ o, large = false }: { o: RiderOrder; large?: boolean }) {
  const size = large ? "px-4 py-3 text-base" : "px-2.5 py-1 text-xs";
  if (o.status === "delivered") {
    return <span className={`rounded-md bg-surface font-semibold text-ink-soft ${size}`}>{o.cod_collected_via === "upi_qr" ? "Collected by UPI" : o.cod_collected_via === "cash" ? "Collected in cash" : "Prepaid"}</span>;
  }
  if (o.collect_amount !== null && o.collect_amount !== undefined) {
    return <span className={`rounded-md bg-amber-100 font-bold text-amber-900 ${size}`}>Collect {rupees(o.collect_amount)}</span>;
  }
  return <span className={`rounded-md bg-brand-light font-semibold text-brand ${size}`}>Paid · nothing to collect</span>;
}

