import { FullPageSpinner, Empty, ErrorText } from "../../components/ui";
import { friendlyError } from "../../lib/errors";
import { useRiderOrders } from "./RiderLayout";
import { DeliveryRow } from "./RiderHome";

/** Deliveries this rider completed in the last 7 days. */
export default function RiderDone() {
  const done = useRiderOrders("done");
  if (done.isLoading) return <FullPageSpinner />;
  const list = [...(done.data ?? [])].sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-2xl">Completed</h1>
        <p className="mt-1 text-sm text-ink-muted">Your deliveries from the last 7 days ({list.length}).</p>
      </div>
      {done.error && <ErrorText>{friendlyError(done.error)}</ErrorText>}
      {list.length === 0 ? (
        <div className="rounded-2xl bg-paper shadow-soft ring-1 ring-line/70"><Empty title="Nothing completed yet" icon="check">Delivered orders show up here.</Empty></div>
      ) : (
        <ul className="space-y-3">{list.map((o) => <li key={o.id}><DeliveryRow o={o} done /></li>)}</ul>
      )}
    </div>
  );
}
