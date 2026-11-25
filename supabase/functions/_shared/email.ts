// Order emails, sent through Brevo's transactional API.
// Secrets: BREVO_API_KEY, EMAIL_FROM (e.g. orders@greenbasket.in, verified in Brevo), EMAIL_FROM_NAME, APP_URL
import { adminDb } from "./db.ts";
import { env } from "./http.ts";

export async function sendEmail(p: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: env("EMAIL_FROM"), name: Deno.env.get("EMAIL_FROM_NAME") ?? "Green Basket" },
      to: [{ email: p.to }],
      subject: p.subject,
      htmlContent: p.html,
      textContent: p.text,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const rupees = (n: unknown) => `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function slotText(slot: { slot_date: string; start_time: string; end_time: string }) {
  const d = new Date(`${slot.slot_date}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata",
  });
  const t = (x: string) => {
    const [h, m] = x.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  return `${d}, ${t(slot.start_time)} – ${t(slot.end_time)}`;
}

function layout(title: string, bodyHtml: string, orderUrl: string) {
  return `<!doctype html><html><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#1f2a24">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden" cellpadding="0" cellspacing="0">
    <tr><td style="background:#00663A;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold">Green Basket</td></tr>
    <tr><td style="padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
      ${bodyHtml}
      <p style="margin:24px 0 0"><a href="${esc(orderUrl)}" style="background:#00663A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">View your order</a></p>
    </td></tr>
    <tr><td style="padding:16px 24px;font-size:12px;color:#6b756f;border-top:1px solid #e5ebe7">Eat Fresh. Live Better. · You are receiving this because you ordered from Green Basket.</td></tr>
  </table></td></tr></table></body></html>`;
}

function itemsTable(items: any[], order: any) {
  const rows = items.map((i) => `<tr>
      <td style="padding:6px 0;${i.is_unavailable ? "text-decoration:line-through;color:#999" : ""}">${esc(i.product_name)} · ${esc(i.variant_label)} × ${i.quantity}</td>
      <td align="right" style="padding:6px 0">${i.is_unavailable ? "Unavailable" : rupees(i.line_total)}</td></tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e5ebe7;margin-top:12px">${rows}
    <tr><td style="padding:6px 0;border-top:1px solid #e5ebe7">Delivery fee</td><td align="right" style="border-top:1px solid #e5ebe7">${rupees(order.delivery_fee)}</td></tr>
    <tr><td style="padding:6px 0;font-weight:bold">Total</td><td align="right" style="font-weight:bold">${rupees(order.total)}</td></tr></table>`;
}

/** Builds the email for a queued template. Returns null if the order no longer exists. */
export async function renderEmail(template: string, payload: Record<string, any>) {
  const db = adminDb();
  const { data: order } = await db
    .from("orders")
    .select("*, order_items(*), delivery_slots(slot_date, start_time, end_time)")
    .eq("id", payload.order_id)
    .maybeSingle();
  if (!order) return null;

  const url = `${env("APP_URL")}/orders/${order.id}`;
  const slot = slotText(order.delivery_slots);
  const name = esc(order.address?.full_name ?? "there");
  const no = esc(order.order_number);
  const pay = order.payment_method === "cod" ? `Pay ${rupees(order.total)} by cash or UPI on delivery.` : "Paid online.";

  const T: Record<string, () => { subject: string; title: string; body: string }> = {
    order_placed: () => ({
      subject: `Order ${order.order_number} confirmed`,
      title: "Thank you! Your order is confirmed.",
      body: `<p>Hi ${name}, we have received order <b>${no}</b>.</p>
             <p><b>Delivery:</b> ${esc(slot)}<br/><b>Payment:</b> ${esc(pay)}</p>${itemsTable(order.order_items, order)}`,
    }),
    order_out_for_delivery: () => ({
      subject: `Order ${order.order_number} is on the way`,
      title: "Your fresh basket is on the way!",
      body: `<p>Hi ${name}, order <b>${no}</b> is out for delivery (${esc(slot)}).</p>
             ${order.payment_method === "cod" ? `<p>Please keep <b>${rupees(order.total)}</b> ready, cash or UPI.</p>` : ""}`,
    }),
    order_delivered: () => ({
      subject: `Order ${order.order_number} delivered`,
      title: "Delivered. Enjoy your fresh produce!",
      body: `<p>Hi ${name}, order <b>${no}</b> has been delivered.</p>${itemsTable(order.order_items, order)}
             <p>Something not right? Reply to this email within 24 hours.</p>`,
    }),
    order_cancelled: () => ({
      subject: `Order ${order.order_number} cancelled`,
      title: "Your order was cancelled",
      body: `<p>Hi ${name}, order <b>${no}</b> was cancelled${order.cancel_reason ? `: ${esc(order.cancel_reason)}` : ""}.</p>
             ${order.payment_status === "paid" ? "<p>Your refund has been started. You will get another email when it is complete.</p>" : ""}`,
    }),
    item_unavailable: () => ({
      subject: `Update on order ${order.order_number}`,
      title: "One item was not available",
      body: `<p>Hi ${name}, sorry: <b>${esc(payload.item)}</b> was not available today, so we removed it from your order.</p>
             <p>Your new total is <b>${rupees(payload.new_total)}</b>.</p>${itemsTable(order.order_items, order)}`,
    }),
    refund_initiated: () => ({
      subject: `Refund started for order ${order.order_number}`,
      title: "We've started your refund",
      body: `<p>Hi ${name}, we are refunding <b>${rupees(payload.amount)}</b> for order <b>${no}</b> (${esc(payload.reason)}).</p>
             <p>It usually reaches your account in 3–5 working days.</p>`,
    }),
    refund_completed: () => ({
      subject: `Refund completed for order ${order.order_number}`,
      title: "Your refund is complete",
      body: `<p>Hi ${name}, <b>${rupees(payload.amount)}</b> for order <b>${no}</b> has been refunded to your original payment method.</p>`,
    }),
  };

  const build = T[template];
  if (!build) throw new Error(`Unknown email template ${template}`);
  const { subject, title, body } = build();
  const text = `${title}\n\n${body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\nView your order: ${url}`;
  return { subject, html: layout(title, body, url), text };
}
