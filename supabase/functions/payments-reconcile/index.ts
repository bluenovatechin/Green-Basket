// Runs every 2 minutes from pg_cron. Safety net for missed or delayed webhooks:
//  1. payments still "created" after 2 minutes -> ask PhonePe and confirm/fail them
//  2. refunds waiting to be sent or still processing -> send / check them
import { adminDb } from "../_shared/db.ts";
import { handleError, json, requireCronSecret } from "../_shared/http.ts";
import { processRefund, syncPayment } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  try {
    requireCronSecret(req);
    const db = adminDb();
    const summary: Record<string, number> = {};
    const bump = (k: string) => (summary[k] = (summary[k] ?? 0) + 1);

    const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: open } = await db
      .from("payments").select("merchant_order_id")
      .eq("status", "created").lt("created_at", twoMinAgo).gt("created_at", dayAgo)
      .order("created_at").limit(40);
    for (const p of open ?? []) {
      try { bump("payment_" + (await syncPayment(p.merchant_order_id))); }
      catch (e) { bump("payment_error"); console.error(e); }
    }

    const { data: refunds, error } = await db.rpc("claim_refunds", { p_limit: 10 });
    if (error) throw error;
    for (const r of refunds ?? []) bump("refund_" + (await processRefund(r)));

    return json({ ok: true, summary });
  } catch (e) {
    return handleError(e);
  }
});
