import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../state/cart";
import { useSettings } from "../../lib/api";
import { rupees } from "../../lib/format";
import { QtyStepper } from "../../components/ProductCard";
import { Button, Card, Empty } from "../../components/ui";

export function useBill(subtotal: number) {
  const { data: s } = useSettings();
  const fee = s && subtotal < s.free_delivery_above ? Number(s.delivery_fee) : 0;
  return {
    settings: s,
    fee,
    total: subtotal + fee,
    belowMin: s ? subtotal < s.min_order_value : false,
    toFree: s && subtotal < s.free_delivery_above ? s.free_delivery_above - subtotal : 0,
  };
}

export default function Cart() {
  const cart = useCart();
  const bill = useBill(cart.subtotal);
  const navigate = useNavigate();

  if (cart.lines.length === 0) {
    return (
      <Empty title="Your basket is empty">
        <Link to="/" className="font-semibold text-brand">Start shopping</Link>
      </Empty>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-bold">Your basket</h1>
      <Card className="divide-y divide-gray-100 p-0">
        {cart.lines.map((l) => (
          <div key={l.variant_id} className="flex items-center gap-3 p-3">
            <div className="h-14 w-14 flex-none overflow-hidden rounded-lg bg-brand-light">
              {l.image_url ? <img src={l.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl">🥕</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{l.name}</div>
              <div className="text-sm text-gray-500">{l.label} · {rupees(l.price)}</div>
            </div>
            <QtyStepper value={l.quantity} onChange={(n) => cart.setQuantity(l.variant_id, n)} max={bill.settings?.max_qty_per_item} />
          </div>
        ))}
      </Card>

      <Card className="space-y-1.5 text-sm">
        <Row label="Items" value={rupees(cart.subtotal)} />
        <Row label="Delivery fee" value={bill.fee === 0 ? "FREE" : rupees(bill.fee)} />
        <Row label="Total" value={rupees(bill.total)} bold />
        {bill.toFree > 0 && <p className="pt-1 text-brand">Add {rupees(bill.toFree)} more for free delivery.</p>}
      </Card>

      {bill.belowMin && bill.settings && (
        <p className="text-sm text-amber-700">Minimum order is {rupees(bill.settings.min_order_value)}.</p>
      )}
      <Button className="w-full" disabled={bill.belowMin} onClick={() => navigate("/checkout")}>
        Choose delivery time
      </Button>
    </div>
  );
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-gray-100 pt-1.5 text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
