import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "../../state/cart";
import { rpc, useAddresses, useOpenSlots } from "../../lib/api";
import { callFunction, supabase } from "../../lib/supabase";
import { dayLabel, newKey, rupees, time12 } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import type { PaymentMethod } from "../../lib/types";
import AddressForm from "../../components/AddressForm";
import { Button, Card, Empty, ErrorText, FullPageSpinner, inputClass } from "../../components/ui";
import { Row, useBill } from "./Cart";

interface PlacedOrder { order_id: string; status: string; total: number }

export default function Checkout() {
  const cart = useCart();
  const bill = useBill(cart.subtotal);
  const addresses = useAddresses();
  const slots = useOpenSlots();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per checkout visit: double taps or a retry after a dropped connection can't create two orders.
  const idempotencyKey = useRef(newKey());

  // Refresh prices so the customer sees today's price before paying
  useEffect(() => {
    const ids = cart.lines.map((l) => l.variant_id);
    if (ids.length === 0) return;
    supabase.from("product_variants").select("id, price").in("id", ids).then(({ data }) => data && cart.updatePrices(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId(addresses.data[0].id);
  }, [addresses.data, addressId]);

  // Pre-select the earliest slot that still has space; the customer can change it
  useEffect(() => {
    if (slotId && slots.data?.some((s) => s.id === slotId && s.booked < s.capacity)) return;
    const first = slots.data?.find((s) => s.booked < s.capacity);
    setSlotId(first?.id ?? null);
  }, [slots.data, slotId]);

  const s = bill.settings;
  const codAllowed = Boolean(s?.cod_enabled && bill.total <= Number(s.cod_max_amount));
  const onlineAllowed = Boolean(s?.online_payment_enabled);
  useEffect(() => {
    if (!method) setMethod(onlineAllowed ? "online" : codAllowed ? "cod" : null);
    if (method === "cod" && !codAllowed) setMethod(onlineAllowed ? "online" : null);
  }, [codAllowed, onlineAllowed, method]);

  const slotsByDay = useMemo(() => {
    const m = new Map<string, NonNullable<typeof slots.data>>();
    for (const sl of slots.data ?? []) m.set(sl.slot_date, [...(m.get(sl.slot_date) ?? []), sl]);
    return [...m.entries()];
  }, [slots.data]);

  if (cart.lines.length === 0) {
    return <Empty title="Your basket is empty"><Link to="/" className="font-semibold text-brand">Start shopping</Link></Empty>;
  }
  if (addresses.isLoading || slots.isLoading || !s) return <FullPageSpinner />;

  async function placeOrder() {
    setError("");
    if (!addressId) return setError("Please add a delivery address.");
    if (!slotId) return setError("Please choose a delivery time.");
    if (!method) return setError("Please choose how to pay.");
    setBusy(true);
    try {
      const order = await rpc<PlacedOrder>("place_order", {
        p_address_id: addressId,
        p_slot_id: slotId,
        p_payment_method: method,
        p_items: cart.lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
        p_idempotency_key: idempotencyKey.current,
        p_note: note || null,
      });
      cart.clear();
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (method === "online" && order.status === "pending_payment") {
        try {
          const { redirect_url } = await callFunction<{ redirect_url: string }>("payment-create", { order_id: order.order_id });
          window.location.href = redirect_url;
          return;
        } catch {
          // order exists and holds stock; the order page lets them retry payment
          navigate(`/orders/${order.order_id}?payment=retry`, { replace: true });
          return;
        }
      }
      navigate(`/orders/${order.order_id}?placed=1`, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
      qc.invalidateQueries({ queryKey: ["slots"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Checkout</h1>
        <Link to="/cart" className="text-sm font-medium text-gray-600">← Basket</Link>
      </div>

      <Card>
        <StepHeader n={1} title="Delivery address" done={Boolean(addressId) && !addingAddress} />
        {addingAddress || !addresses.data?.length ? (
          <AddressForm
            onSaved={(a) => { setAddressId(a.id); setAddingAddress(false); }}
            onCancel={addresses.data?.length ? () => setAddingAddress(false) : undefined}
          />
        ) : (
          <div className="space-y-2">
            {addresses.data.map((a) => (
              <label key={a.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${addressId === a.id ? "border-brand bg-brand-light" : "border-gray-200"}`}>
                <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 accent-brand" />
                <span className="text-sm">
                  <b>{a.label}</b> · {a.full_name}, {a.phone}<br />
                  {a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.landmark ? `, near ${a.landmark}` : ""}, {a.city} {a.pincode}
                </span>
              </label>
            ))}
            <Button variant="ghost" onClick={() => setAddingAddress(true)}>+ Add new address</Button>
          </div>
        )}
      </Card>

      <Card>
        <StepHeader n={2} title="Delivery time" done={Boolean(slotId)} />
        {slotsByDay.length === 0 && <p className="text-sm text-gray-600">No delivery slots open right now. Please check back soon.</p>}
        <div className="space-y-3">
          {slotsByDay.map(([day, list]) => (
            <div key={day}>
              <div className="mb-1.5 text-sm font-medium text-gray-600">{dayLabel(day)}</div>
              <div className="grid grid-cols-2 gap-2">
                {list.map((sl) => {
                  const left = sl.capacity - sl.booked;
                  const full = left <= 0;
                  return (
                    <button key={sl.id} disabled={full} onClick={() => setSlotId(sl.id)}
                      className={`rounded-xl border p-3 text-left text-sm disabled:opacity-40 ${slotId === sl.id ? "border-brand bg-brand-light" : "border-gray-200 bg-white"}`}>
                      <div className="font-semibold">{time12(sl.start_time)} – {time12(sl.end_time)}</div>
                      <div className="text-xs text-gray-500">{full ? "Full" : left <= 5 ? `Only ${left} left` : "Available"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <StepHeader n={3} title="Payment" done={Boolean(method)} />
        <div className="space-y-2">
          {onlineAllowed && (
            <PayOption checked={method === "online"} onChange={() => setMethod("online")} title="Pay online" sub="UPI, cards, net banking via PhonePe" />
          )}
          {s.cod_enabled && (
            <PayOption checked={method === "cod"} onChange={() => setMethod("cod")} disabled={!codAllowed} title="Cash or UPI on delivery"
              sub={codAllowed ? "Pay the rider by cash or by scanning our UPI QR" : `Available for orders up to ${rupees(s.cod_max_amount)}`} />
          )}
        </div>
        <textarea className={`${inputClass} mt-3`} rows={2} maxLength={300} placeholder="Note for the delivery person (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </Card>

      <Card className="space-y-1.5 text-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold">Bill summary</span>
          <Link to="/cart" className="text-brand">Edit basket</Link>
        </div>
        <Row label={`Items (${cart.count})`} value={rupees(cart.subtotal)} />
        <Row label="Delivery fee" value={bill.fee === 0 ? "FREE" : rupees(bill.fee)} />
        <Row label="To pay" value={rupees(bill.total)} bold />
      </Card>

      <ErrorText>{error}</ErrorText>

      {/* Sticky action bar: always visible, tells the customer what's missing */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold leading-tight">{rupees(bill.total)}</div>
            <div className="truncate text-xs text-gray-500">
              {!addressId ? "Add a delivery address" : !slotId ? "Choose a delivery time" : !method ? "Choose payment" : bill.fee === 0 ? "Free delivery" : `incl. ${rupees(bill.fee)} delivery`}
            </div>
          </div>
          <Button className="min-w-[10rem] text-base" loading={busy} disabled={bill.belowMin || !addressId || !slotId || !method} onClick={placeOrder}>
            {method === "online" ? "Pay now" : "Place order"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-semibold">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-brand text-white" : "bg-gray-200 text-gray-600"}`}>
        {done ? "✓" : n}
      </span>
      {title}
    </h2>
  );
}

function PayOption(p: { checked: boolean; onChange: () => void; title: string; sub: string; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${p.disabled ? "opacity-50" : ""} ${p.checked ? "border-brand bg-brand-light" : "border-gray-200"}`}>
      <input type="radio" name="pay" checked={p.checked} disabled={p.disabled} onChange={p.onChange} className="mt-1 accent-brand" />
      <span><b className="block text-sm">{p.title}</b><span className="text-xs text-gray-600">{p.sub}</span></span>
    </label>
  );
}
