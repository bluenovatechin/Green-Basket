import { dateTime, rupees, slotLabel } from "../lib/format";
import type { Order, OrderStatus } from "../lib/types";
import Icon, { type IconName } from "./Icon";

const STEPS: { status: OrderStatus; label: string; icon: IconName }[] = [
  { status: "placed", label: "Placed", icon: "receipt" },
  { status: "confirmed", label: "Confirmed", icon: "check" },
  { status: "packed", label: "Packed", icon: "package" },
  { status: "out_for_delivery", label: "On the way", icon: "bike" },
  { status: "delivered", label: "Delivered", icon: "home" },
];

function headline(o: Order): { title: string; text: string; tone: "brand" | "amber" | "red" | "muted" } {
  const slot = slotLabel(o.delivery_slots);
  switch (o.status) {
    case "pending_payment":
      return { title: "Waiting for payment", text: "Complete the payment to confirm your order.", tone: "amber" };
    case "placed":
      return { title: "Order received", text: `We'll confirm it shortly · ${slot}`, tone: "brand" };
    case "confirmed":
      return { title: "Order confirmed", text: `We're picking your produce fresh from the mandi · ${slot}`, tone: "brand" };
    case "packed":
      return { title: "Packed and ready", text: `A rider will pick it up soon · ${slot}`, tone: "brand" };
    case "out_for_delivery":
      return {
        title: "On the way",
        text: o.payment_method === "cod" && o.payment_status !== "paid" ? `Please keep ${rupees(o.total)} ready (cash or UPI)` : "Your rider is heading to you",
        tone: "brand",
      };
    case "delivered":
      return { title: "Delivered", text: "Enjoy your fresh basket. Something wrong? Tell us within 24 hours.", tone: "brand" };
    case "cancelled":
      return { title: "Order cancelled", text: o.cancel_reason ?? "This order was cancelled.", tone: "muted" };
    case "payment_failed":
      return { title: "Payment not completed", text: "No money was taken. Your items were released.", tone: "red" };
  }
}

const DOT = { brand: "bg-brand", amber: "bg-amber-500", red: "bg-red-500", muted: "bg-stone-400" };

export default function OrderTracker({ order }: { order: Order }) {
  const h = headline(order);
  const current = STEPS.findIndex((s) => s.status === order.status);
  const timeOf = (st: OrderStatus) => order.order_events?.find((e) => e.to_status === st)?.created_at;
  const live = order.status === "out_for_delivery";

  return (
    <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line/60">
      <div className="flex items-start gap-3">
        <span className="relative mt-1.5 flex h-2.5 w-2.5">
          {live && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${DOT[h.tone]} opacity-60`} />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT[h.tone]}`} />
        </span>
        <div>
          <h2 className="text-lg font-extrabold leading-tight">{h.title}</h2>
          <p className="text-sm text-ink-muted">{h.text}</p>
        </div>
      </div>

      {current >= 0 && (
        <div className="relative mt-6">
          <div className="absolute left-[10%] right-[10%] top-5 h-[3px] rounded-full bg-surface" />
          <div
            className="absolute left-[10%] top-5 h-[3px] rounded-full bg-brand transition-all duration-700"
            style={{ width: `${(current / (STEPS.length - 1)) * 80}%` }}
          />
          <ol className="relative grid grid-cols-5">
            {STEPS.map((s, i) => {
              const done = i < current;
              const now = i === current;
              const t = timeOf(s.status);
              return (
                <li key={s.status} className="flex flex-col items-center text-center">
                  <span
                    aria-current={now ? "step" : undefined}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                      done ? "bg-brand text-white" : now ? "bg-white text-brand ring-2 ring-brand shadow-[0_0_0_6px_rgba(0,102,58,0.12)]" : "bg-surface text-ink-muted/60"
                    }`}
                  >
                    <Icon name={done ? "check" : s.icon} size={18} strokeWidth={done ? 2.5 : 1.75} />
                  </span>
                  <span className={`mt-2 text-[11px] font-semibold leading-tight ${done || now ? "text-ink" : "text-ink-muted/70"}`}>{s.label}</span>
                  {t && (done || now) && <span className="tabular text-[10px] text-ink-muted">{dateTime(t).split(", ").pop()}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
