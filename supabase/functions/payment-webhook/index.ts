// PhonePe server-to-server callback. Configure this URL and the username/password in the PhonePe dashboard:
//   https://<project-ref>.supabase.co/functions/v1/payment-webhook
// We verify the Authorization header, then ask PhonePe for the real status (never trusting the body alone).
import { json } from "../_shared/http.ts";
import { verifyWebhook } from "../_shared/phonepe.ts";
import { syncPayment, syncRefundById } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!(await verifyWebhook(req.headers.get("Authorization")))) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const body = await req.json();
    const event: string = body?.event ?? body?.type ?? "";
    const payload = body?.payload ?? {};

    let result = "ignored";
    if (payload.merchantRefundId || event.includes("refund")) {
      if (payload.merchantRefundId) result = await syncRefundById(String(payload.merchantRefundId));
    } else if (payload.merchantOrderId) {
      result = await syncPayment(String(payload.merchantOrderId));
    }
    console.log(`webhook ${event}: ${result}`);
    return json({ ok: true, result });
  } catch (e) {
    console.error(e);
    // Non-200 makes PhonePe retry; the reconciler also catches anything missed.
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});
