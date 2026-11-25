import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { rpc, useOrder, useSettings } from "../../lib/api";
import { callFunction } from "../../lib/supabase";
import { dateTime, qty, rupees, slotLabel, STATUS_LABEL } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import type { OrderStatus } from "../../lib/types";
import { Button, Card, Empty, ErrorText, FullPageSpinner } from "../../components/ui";
import OrderTracker from "../../components/OrderTracker";
import Icon from "../../components/Icon";
import { Row } from "./Cart";

export default function OrderDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const returning = params.get("payment") === "return";
  const justPlaced = params.get("placed") === "1";
  const [checking, setChecking] = useState(returning);
  const order = useOrder(id, checking ? 3000 : 20_000);
  const settings = useSettings();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showItems, setShowItems] = useState(false);
  const started = useRef(false);

  // Back from PhonePe: ask the server to check the payment now instead of waiting for the webhook
  useEffect(() => {
    if (!returning || !id || started.current) return;
    started.current = true;
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const r = await callFunction<{ status: OrderStatus; sync: string }>("payment-status", { order_id: id });
        // stop once PhonePe has a final answer (paid / failed), or after ~30 seconds
        if (r.sync !== "pending" || tries >= 10) {
          setChecking(false);
          await qc.invalidateQueries({ queryKey: ["order", id] });
          if (r.status === "placed") setParams({ placed: "1" }, { replace: true });
          return;
        }
      } catch {
        if (tries >= 10) return setChecking(false);
      }
      setTimeout(tick, 3000);
    };
    void tick();
  }, [returning, id, qc, setParams]);

  if (order.isLoading) return <FullPageSpinner />;
  if (!order.data) return <Empty title="Order not found"><Link to="/orders" className="text-brand">Back to orders</Link></Empty>;
  const o = order.data;

  async function pay() {
    setError("");
    setBusy(true);
    try {
      const { redirect_url } = await callFunction<{ redirect_url: string }>("payment-create", { order_id: o.id });
      window.location.href = redirect_url;
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  async function switchToCod() {
    setError("");
    setBusy(true);
    try {
      await rpc("switch_to_cod", { p_order_id: o.id });
      await qc.invalidateQueries({ queryKey: ["order", o.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setParams({ placed: "1" }, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancel this order? Items go back on sale and any payment is refunded.")) return;
    setError("");
    setBusy(true);
    try {
      await rpc("cancel_order", { p_order_id: o.id, p_reason: "Cancelled by customer" });
      await qc.invalidateQueries({ queryKey: ["order", o.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const minutesLeft = o.payment_expires_at ? Math.max(0, Math.ceil((new Date(o.payment_expires_at).getTime() - Date.now()) / 60000)) : 0;
  const canCancel = ["pending_payment", "placed", "confirmed"].includes(o.status);
  const items = o.order_items ?? [];
  const activeItems = items.filter((i) => !i.is_unavailable);
  const support = settings.data?.support_phone;
  const s = settings.data;
  const codPossible = Boolean(s?.cod_enabled && Number(o.total) <= Number(s.cod_max_amount));
  const canPayOnlineNow = Boolean(
    s?.online_payment_enabled && o.payment_method === "cod" && o.payment_status !== "paid" &&
    ["placed", "confirmed", "packed", "out_for_delivery"].includes(o.status),
  );

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-6">
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft">← My orders</Link>

      {justPlaced && o.status !== "pending_payment" && (
        <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-center text-white">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl text-brand">✓</div>
          <h1 className="text-xl font-bold">Order placed!</h1>
          <p className="text-sm text-white/90">Order {o.order_number} · {rupees(o.total)}</p>
          <p className="mt-1 text-sm text-white/90">Delivery {slotLabel(o.delivery_slots)}</p>
        </div>
      )}

      {!justPlaced && (
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">Order {o.order_number}</h1>
          <span className="text-sm text-ink-muted">{dateTime(o.created_at)}</span>
        </div>
      )}

      {o.status === "pending_payment" && (
        <Card className="border-amber-300 bg-amber-50">
          {checking ? (
            <p className="flex items-center gap-2 font-medium"><span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-700 border-r-transparent" />Checking your payment with PhonePe…</p>
          ) : (
            <>
              <p className="font-semibold">Complete your payment</p>
              <p className="text-sm text-ink-soft">Your items are held for {minutesLeft} more minute{minutesLeft === 1 ? "" : "s"}. Choose how you'd like to pay:</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button loading={busy} onClick={pay} disabled={minutesLeft === 0}>
                  <Icon name="wallet" size={18} /> Pay {rupees(o.total)} online
                </Button>
                {codPossible && (
                  <Button variant="secondary" disabled={busy} onClick={switchToCod}>
                    <Icon name="truck" size={18} /> Pay on delivery instead
                  </Button>
                )}
              </div>
              {codPossible && <p className="mt-2 text-xs text-ink-muted">"Pay on delivery" confirms your order now; pay the rider by cash or UPI.</p>}
            </>
          )}
        </Card>
      )}

      <OrderTracker order={o} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Delivery</div>
          <div className="font-semibold">{slotLabel(o.delivery_slots)}</div>
          <div className="mt-1 text-ink-soft">
            {o.address.full_name} · {o.address.phone}<br />
            {o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ""}, {o.address.city} {o.address.pincode}
          </div>
        </Card>
        <Card className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Payment</div>
          <div className="font-semibold">{o.payment_method === "cod" ? "Cash / UPI on delivery" : "Online (PhonePe)"}</div>
          <div className="mt-1 text-ink-soft">
            {o.payment_status === "paid" ? "✓ Paid" : o.payment_method === "cod" ? `Pay ${rupees(o.total)} to the rider` : o.payment_status === "failed" ? "Not paid" : "Waiting for payment"}
          </div>
          {canPayOnlineNow && (
            <button onClick={pay} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand hover:text-white disabled:opacity-50">
              <Icon name="wallet" size={14} /> Pay online now instead
            </button>
          )}
        </Card>
      </div>

      <Card className="text-sm">
        <button className="flex w-full items-center justify-between" onClick={() => setShowItems((v) => !v)} aria-expanded={showItems}>
          <span className="font-semibold">{activeItems.length} item{activeItems.length === 1 ? "" : "s"} · {rupees(o.total)}</span>
          <span className="text-brand">{showItems ? "Hide" : "View bill"}</span>
        </button>
        {showItems && (
          <div className="mt-3">
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <span className={i.is_unavailable ? "text-ink-muted line-through" : ""}>
                    {i.product_name} · {i.variant_label} × {i.quantity}
                    <span className="block text-xs text-ink-muted">{qty(i.unit, i.pack_qty * i.quantity)}</span>
                  </span>
                  <span className={i.is_unavailable ? "text-ink-muted" : ""}>{i.is_unavailable ? "Unavailable" : rupees(i.line_total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t border-line pt-2">
              <Row label="Items" value={rupees(o.subtotal)} />
              <Row label="Delivery fee" value={Number(o.delivery_fee) === 0 ? "FREE" : rupees(o.delivery_fee)} />
              <Row label="Total" value={rupees(o.total)} bold />
            </div>
          </div>
        )}
        {o.refunds?.map((r) => (
          <p key={r.id} className="mt-3 rounded-lg bg-sky-50 p-2 text-sky-800">
            Refund of {rupees(r.amount)} ({r.reason}): <b>{r.status === "success" ? "completed" : r.status === "failed" ? "needs attention, we'll contact you" : "in progress (3–5 working days)"}</b>
          </p>
        ))}
      </Card>

      {!!o.order_events?.length && (
        <details className="rounded-2xl bg-white ring-1 ring-line/60 shadow-soft p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Order history</summary>
          <ul className="mt-2 space-y-1.5">
            {o.order_events.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>{STATUS_LABEL[e.to_status]}{e.note ? ` – ${e.note}` : ""}</span>
                <span className="whitespace-nowrap text-ink-muted">{dateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => navigate("/")}>Continue shopping</Button>
        {support ? (
          <a href={`tel:${support}`} className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white ring-1 ring-inset ring-line font-semibold"><Icon name="phone" size={18} className="mr-2" />Call support</a>
        ) : (
          <a href={`mailto:${settings.data?.support_email ?? ""}`} className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white ring-1 ring-inset ring-line font-semibold">Need help?</a>
        )}
      </div>
      {canCancel && (
        <button className="w-full py-2 text-sm font-medium text-red-600 disabled:opacity-50" disabled={busy} onClick={cancel}>Cancel order</button>
      )}
    </div>
  );
}
