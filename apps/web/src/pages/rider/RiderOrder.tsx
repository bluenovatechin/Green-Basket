import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { rpc } from "../../lib/api";
import { slotLabel } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import Icon from "../../components/Icon";
import { Button, Card, Empty, ErrorText, FullPageSpinner, StatusBadge } from "../../components/ui";
import { useRiderOrders } from "./RiderLayout";
import { CollectPill } from "./RiderHome";

export default function RiderOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const active = useRiderOrders("active");
  const done = useRiderOrders("done");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const o = active.data?.find((x) => x.id === id) ?? done.data?.find((x) => x.id === id);
  const back = (
    <button
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/rider"))}
      className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-md pr-3 text-sm font-semibold text-ink-soft hover:text-ink"
    >
      <Icon name="chevronLeft" size={18} /> Back to deliveries
    </button>
  );

  if (!o && (active.isLoading || done.isLoading)) return <FullPageSpinner />;
  if (!o) {
    return (
      <div>
        {back}
        <Card><Empty title="Delivery not found" icon="package">It may have been reassigned or cancelled. <Link to="/rider" className="font-semibold text-brand underline">See your deliveries</Link></Empty></Card>
      </div>
    );
  }

  async function act(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setError("");
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["rider"] });
      after?.();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const a = o.address;
  const fullAddress = `${a.line1}${a.line2 ? `, ${a.line2}` : ""}${a.landmark ? `, near ${a.landmark}` : ""}, ${a.city} ${a.pincode}`;
  const mapQuery = encodeURIComponent(`${a.line1} ${a.line2 ?? ""} ${a.landmark ?? ""} ${a.city} ${a.pincode}`);
  const collect = o.collect_amount !== null && o.collect_amount !== undefined;
  const itemsCount = o.order_items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="pb-24">
      {back}
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="display text-2xl">{o.order_number}</h1>
        <StatusBadge status={o.status} />
      </div>

      <div className="space-y-4">
        <Card className="space-y-3">
          <div className="text-sm text-ink-muted">{slotLabel(o.delivery_slots)}</div>
          <div>
            <div className="text-lg font-bold">{a.full_name}</div>
            <p className="mt-1 text-[15px] leading-6 text-ink-soft">{fullAddress}</p>
          </div>
          {o.customer_note && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"><b>Note:</b> {o.customer_note}</p>}
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${a.phone}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-paper font-semibold ring-1 ring-inset ring-line hover:bg-surface">
              <Icon name="phone" size={18} /> Call
            </a>
            <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-paper font-semibold ring-1 ring-inset ring-line hover:bg-surface">
              <Icon name="pin" size={18} /> Directions
            </a>
          </div>
        </Card>

        <div className="flex justify-center"><CollectPill o={o} large /></div>

        <Card>
          <h2 className="mb-2 font-semibold">Items ({itemsCount})</h2>
          <ul className="divide-y divide-line text-sm">
            {o.order_items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span>{i.product_name} <span className="text-ink-muted">· {i.variant_label}</span></span>
                <b className="tabular">× {i.quantity}</b>
              </li>
            ))}
          </ul>
        </Card>

        <ErrorText>{error}</ErrorText>
      </div>

      {/* main action stays at the bottom of the screen, above the tabs */}
      {(o.status === "packed" || o.status === "out_for_delivery") && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0">
          <div className="mx-auto max-w-3xl">
            {o.status === "packed" && (
              <Button size="lg" className="w-full" loading={busy === "start"} onClick={() => act("start", () => rpc("set_order_status", { p_order_id: o.id, p_status: "out_for_delivery", p_note: null }))}>
                <Icon name="bike" size={18} /> Start delivery
              </Button>
            )}
            {o.status === "out_for_delivery" && (collect ? (
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" loading={busy === "cash"} onClick={() => act("cash", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: "cash" }), () => navigate("/rider"))}>Got cash</Button>
                <Button size="lg" variant="dark" loading={busy === "upi"} onClick={() => act("upi", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: "upi_qr" }), () => navigate("/rider"))}>Got UPI</Button>
              </div>
            ) : (
              <Button size="lg" className="w-full" loading={busy === "done"} onClick={() => act("done", () => rpc("complete_delivery", { p_order_id: o.id, p_collected_via: null }), () => navigate("/rider"))}>
                <Icon name="check" size={18} /> Mark delivered
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
