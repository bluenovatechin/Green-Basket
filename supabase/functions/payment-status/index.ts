// POST { order_id } -> current order status, after checking PhonePe for any payment still in progress.
// Called by the order page when the customer returns from PhonePe, so they don't wait for the webhook.
import { adminDb, requireUser } from "../_shared/db.ts";
import { handleError, HttpError, json, preflight } from "../_shared/http.ts";
import { syncPayment } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const { user } = await requireUser(req);
    const { order_id } = await req.json().catch(() => ({}));
    if (typeof order_id !== "string") throw new HttpError(400, "INVALID_REQUEST");

    const db = adminDb();
    const { data: order } = await db.from("orders").select("id, user_id").eq("id", order_id).maybeSingle();
    if (!order || order.user_id !== user.id) throw new HttpError(404, "ORDER_NOT_FOUND");

    const { data: open } = await db
      .from("payments").select("merchant_order_id").eq("order_id", order_id).eq("status", "created")
      .order("created_at", { ascending: false }).limit(3);
    let last = "no_open_payment";
    for (const p of open ?? []) last = await syncPayment(p.merchant_order_id);

    const { data: fresh } = await db.from("orders").select("status, payment_status").eq("id", order_id).single();
    return json({ ...fresh, sync: last });
  } catch (e) {
    return handleError(e);
  }
});
