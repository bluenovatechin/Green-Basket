import { dateTime, rupees, slotLabel } from "../lib/format";
import type { Order, OrderStatus } from "../lib/types";

const STEPS: { status: OrderStatus; label: string; icon: string }[] = [
  { status: "placed", label: "Placed", icon: "🧾" },
  { status: "confirmed", label: "Confirmed", icon: "✅" },
  { status: "packed", label: "Packed", icon: "📦" },
  { status: "out_for_delivery", label: "On the way", icon: "🛵" },
  { status: "delivered", label: "Delivered", icon: "🏠" },
];

function headline(o: Order): { title: string; text: string; tone: "green" | "amber" | "red" | "gray" } {
  const slot = slotLabel(o.delivery_slots);
  switch (o.status) {
    case "pending_payment":
      return { title: "Waiting for payment", text: "Complete the payment to confirm your order.", tone: "amber" };
    case "placed":
      return { title: "Order received", text: `We'll confirm it shortly. Delivery ${slot}.`, tone: "green" };
    case "confirmed":
      return { title: "Order confirmed", text: `We're getting your produce fresh from the mandi. Delivery ${slot}.`, tone: "green" };
    case "packed":
      return { title: "Packed and ready", text: `A rider will pick it up soon. Delivery ${slot}.`, tone: "green" };
    case "out_for_delivery":
      return {
        title: "On the way!",
        text: o.payment_method === "cod" && o.payment_status !== "paid" ? `Please keep ${rupees(o.total)} ready (cash or UPI).` : "Your rider is heading to you.",
        tone: "green",
      };
    case "delivered":
      return { title: "Delivered", text: "Enjoy your fresh basket! Something wrong? Contact us within 24 hours.", tone: "green" };
    case "cancelled":
      return { title: "Order cancelled", text: o.cancel_reason ?? "This order was cancelled.", tone: "gray" };
    case "payment_failed":
      return { title: "Payment not completed", text: "No money was taken for this order. Your items were released.", tone: "red" };
  }
}

const TONE = {
  green: "bg-brand text-white",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-200 text-gray-800",
};

export default function OrderTracker({ order }: { order: Order }) {
  const h = headline(order);
  const current = STEPS.findIndex((s) => s.status === order.status);
  const timeOf = (st: OrderStatus) => order.order_events?.find((e) => e.to_status === st)?.created_at;
  const showSteps = current >= 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className={`px-4 py-4 ${TONE[h.tone]}`}>
        <div className="flex items-center gap-2 text-lg font-bold">
          {order.status === "out_for_delivery" && <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-white" /></span>}
          {h.title}
        </div>
        <p className="text-sm opacity-90">{h.text}</p>
      </div>

      {showSteps && (
        <div className="px-3 pb-4 pt-5">
          <div className="relative">
            {/* track */}
            <div className="absolute left-[10%] right-[10%] top-5 h-1 rounded bg-gray-200" />
            <div
              className="absolute left-[10%] top-5 h-1 rounded bg-brand transition-all duration-700"
              style={{ width: `${(Math.max(current, 0) / (STEPS.length - 1)) * 80}%` }}
            />
            <ol className="relative grid grid-cols-5">
              {STEPS.map((s, i) => {
                const done = i < current;
                const now = i === current;
                const t = timeOf(s.status);
                return (
                  <li key={s.status} className="flex flex-col items-center text-center">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg transition ${
                        done ? "border-brand bg-brand text-white" : now ? "border-brand bg-white ring-4 ring-brand/20" : "border-gray-200 bg-white grayscale opacity-60"
                      }`}
                      aria-current={now ? "step" : undefined}
                    >
                      {done ? "✓" : s.icon}
                    </span>
                    <span className={`mt-1.5 text-[11px] font-semibold leading-tight ${done || now ? "text-brand" : "text-gray-400"}`}>{s.label}</span>
                    {t && (done || now) && <span className="text-[10px] text-gray-500">{dateTime(t).split(", ").pop()}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
