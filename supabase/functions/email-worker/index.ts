// Runs every minute from pg_cron. Sends queued order emails through Brevo, with retries.
import { adminDb } from "../_shared/db.ts";
import { renderEmail, sendEmail } from "../_shared/email.ts";
import { handleError, json, requireCronSecret } from "../_shared/http.ts";

Deno.serve(async (req) => {
  try {
    requireCronSecret(req);
    const db = adminDb();
    const { data: batch, error } = await db.rpc("claim_email_batch", { p_limit: 25 });
    if (error) throw error;

    let sent = 0, failed = 0;
    for (const m of batch ?? []) {
      try {
        const email = await renderEmail(m.template, m.payload ?? {});
        if (email) await sendEmail({ to: m.to_email, ...email });
        await db.rpc("complete_email", { p_id: m.id, p_ok: true, p_error: null });
        sent++;
      } catch (e) {
        failed++;
        await db.rpc("complete_email", { p_id: m.id, p_ok: false, p_error: String((e as Error).message) });
      }
    }
    return json({ ok: true, sent, failed });
  } catch (e) {
    return handleError(e);
  }
});
