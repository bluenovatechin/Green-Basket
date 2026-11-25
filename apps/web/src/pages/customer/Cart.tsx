import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../state/cart";
import { useSettings } from "../../lib/api";
import { rupees } from "../../lib/format";
import { ProductImage, QtyStepper } from "../../components/ProductCard";
import Icon from "../../components/Icon";
import { Button, Card, Empty } from "../../components/ui";
import { usePrivatePage } from "../../lib/seo";

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
  usePrivatePage("Your Basket");
  const cart = useCart();
  const bill = useBill(cart.subtotal);
  const navigate = useNavigate();

  if (cart.lines.length === 0) {
    return (
      <Empty title="Your basket is empty" icon="bag" heading="h1">
        <p className="mb-5">Fresh vegetables and fruits are waiting for you.</p>
        <Link to="/"><Button>Start shopping</Button></Link>
      </Empty>
    );
  }

  const freePct = bill.settings ? Math.min(100, (cart.subtotal / bill.settings.free_delivery_above) * 100) : 0;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 pb-20 lg:grid-cols-[1fr_360px] lg:pb-0">
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="display text-3xl">Your basket</h1>
            <p className="text-sm text-ink-muted">{cart.count} item{cart.count === 1 ? "" : "s"}</p>
          </div>
          <Link to="/" className="text-sm font-semibold text-brand">+ Add more</Link>
        </div>

        {bill.settings && (
          <div className="rounded-3xl bg-white p-4 ring-1 ring-line/60">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon name="truck" size={18} className="text-brand" />
              {bill.toFree > 0 ? <>Add <b className="tabular">{rupees(bill.toFree)}</b> more for free delivery</> : <b className="text-brand">You get free delivery</b>}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${freePct}%` }} />
            </div>
          </div>
        )}

        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-line/60">
          {cart.lines.map((l) => (
            <li key={l.variant_id} className="flex items-center gap-4 p-4">
              <div className="h-16 w-16 flex-none overflow-hidden rounded-2xl bg-surface">
                <ProductImage name={l.name} image_url={l.image_url} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{l.name}</div>
                <div className="text-sm text-ink-muted">{l.label}</div>
                <div className="tabular mt-0.5 text-sm font-bold">{rupees(l.price * l.quantity)}</div>
              </div>
              <QtyStepper size="sm" value={l.quantity} onChange={(n) => cart.setQuantity(l.variant_id, n)} max={bill.settings?.max_qty_per_item} />
            </li>
          ))}
        </ul>
      </div>

      <div className="lg:pt-14">
        <Card className="space-y-2.5 lg:sticky lg:top-24">
          <h2 className="font-bold">Bill details</h2>
          <Row label="Item total" value={rupees(cart.subtotal)} />
          <Row label="Delivery fee" value={bill.fee === 0 ? "Free" : rupees(bill.fee)} />
          <Row label="To pay" value={rupees(bill.total)} bold />
          {bill.belowMin && bill.settings && (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Minimum order is {rupees(bill.settings.min_order_value)}.</p>
          )}
          <Button size="lg" className="mt-2 hidden w-full lg:flex" disabled={bill.belowMin} onClick={() => navigate("/checkout")}>
            Continue to checkout <Icon name="arrowRight" size={18} />
          </Button>
        </Card>
      </div>

      {/* mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-surface via-surface to-transparent px-4 pb-3 pt-6 sm:bottom-0 lg:hidden">
        <Button size="lg" className="w-full justify-between pl-6 pr-5" disabled={bill.belowMin} onClick={() => navigate("/checkout")}>
          <span className="tabular">{rupees(bill.total)}</span>
          <span className="flex items-center gap-1">Checkout <Icon name="arrowRight" size={18} /></span>
        </Button>
      </div>
    </div>
  );
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "border-t border-dashed border-line pt-3 text-base font-extrabold" : "text-ink-soft"}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
