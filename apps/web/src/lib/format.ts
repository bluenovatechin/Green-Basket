import type { OrderStatus, StockUnit } from "./types";

export const rupees = (n: number | string | null | undefined) =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** 2500 g -> "2.5 kg", 3 bunch -> "3 bunches" */
export function qty(unit: StockUnit, amount: number | string): string {
  const n = Number(amount);
  if (unit === "g") return n >= 1000 ? `${trim(n / 1000)} kg` : `${trim(n)} g`;
  if (unit === "ml") return n >= 1000 ? `${trim(n / 1000)} L` : `${trim(n)} ml`;
  const names: Record<string, [string, string]> = { piece: ["piece", "pieces"], bunch: ["bunch", "bunches"], pack: ["pack", "packs"] };
  const [one, many] = names[unit];
  return `${trim(n)} ${n === 1 ? one : many}`;
}
const trim = (n: number) => Number(n.toFixed(2)).toString();

export function time12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** Today's date in India as YYYY-MM-DD */
export function todayIST(offsetDays = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(date: string): string {
  if (date === todayIST()) return "Today";
  if (date === todayIST(1)) return "Tomorrow";
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata",
  });
}

export function slotLabel(s?: { slot_date: string; start_time: string; end_time: string } | null): string {
  if (!s) return "";
  return `${dayLabel(s.slot_date)}, ${time12(s.start_time)} – ${time12(s.end_time)}`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  payment_failed: "Payment not completed",
};

export const STATUS_COLOR: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-50 text-amber-700",
  placed: "bg-sky-50 text-sky-700",
  confirmed: "bg-indigo-50 text-indigo-700",
  packed: "bg-violet-50 text-violet-700",
  out_for_delivery: "bg-orange-50 text-orange-700",
  delivered: "bg-brand-light text-brand",
  cancelled: "bg-stone-100 text-stone-600",
  payment_failed: "bg-red-50 text-red-700",
};

export function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
