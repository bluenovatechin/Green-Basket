// POST { order_id } with the customer's login token -> { redirect_url } to PhonePe's payment page.
import { adminDb, requireUser } from "../_shared/db.ts";
import { env, handleError, HttpError, json, preflight } from "../_shared/http.ts";
import * as phonepe from "../_shared/phonepe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const { user } = await requireUser(req);
    const { order_id } = await req.json().catch(() => ({}));
    if (typeof order_id !== "string") throw new HttpError(400, "INVALID_REQUEST");

    const db = adminDb();
    const { data: attempt, error } = await db.rpc("create_payment_attempt", { p_order_id: order_id, p_user_id: user.id });
    if (error) throw new HttpError(409, error.message);

    const secondsLeft = (new Date(attempt.expires_at).getTime() - Date.now()) / 1000;
    try {
      const checkout = await phonepe.createCheckout({
        merchantOrderId: attempt.merchant_order_id,
        amountPaise: Math.round(Number(attempt.amount) * 100),
        redirectUrl: `${env("APP_URL")}/orders/${order_id}?payment=return`,
        expireAfterSeconds: secondsLeft,
      });
      await db.from("payments")
        .update({ provider_order_id: checkout.orderId, raw: checkout.raw })
        .eq("merchant_order_id", attempt.merchant_order_id);
      return json({ redirect_url: checkout.redirectUrl });
    } catch (e) {
      // PhonePe refused or was unreachable: close this attempt so the customer can retry
      await db.rpc("fail_online_payment", {
        p_merchant_order_id: attempt.merchant_order_id,
        p_raw: { error: String((e as Error).message).slice(0, 500) },
      });
      console.error(e);
      throw new HttpError(502, "PAYMENT_PROVIDER_ERROR");
    }
  } catch (e) {
    return handleError(e);
  }
});
