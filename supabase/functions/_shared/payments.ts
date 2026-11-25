// Payment and refund syncing, shared by the webhook, the return page and the reconciler.
// Every path asks PhonePe for the real status instead of trusting what the browser or webhook body says,
// and the database functions are idempotent, so running these twice is harmless.
import { adminDb } from "./db.ts";
import * as phonepe from "./phonepe.ts";

export async function syncPayment(merchantOrderId: string): Promise<string> {
  const db = adminDb();
  const { data: payment } = await db
    .from("payments").select("id, amount, status").eq("merchant_order_id", merchantOrderId).maybeSingle();
  if (!payment) return "unknown_payment";
  if (payment.status === "success") return "already_confirmed";

  const status = await phonepe.getOrderStatus(merchantOrderId);

  if (status.state === "COMPLETED") {
    const expected = Math.round(Number(payment.amount) * 100);
    if (status.amountPaise !== expected) {
      // Never confirm a payment for the wrong amount. Leave it for a human to check.
      console.error(`Amount mismatch for ${merchantOrderId}: expected ${expected}, got ${status.amountPaise}`);
      return "amount_mismatch";
    }
    const { data, error } = await db.rpc("confirm_online_payment", {
      p_merchant_order_id: merchantOrderId,
      p_provider_order_id: status.orderId ?? null,
      p_raw: status.raw,
    });
    if (error) throw error;
    return data as string;
  }
  if (status.state === "FAILED") {
    const { data, error } = await db.rpc("fail_online_payment", { p_merchant_order_id: merchantOrderId, p_raw: status.raw });
    if (error) throw error;
    return data as string;
  }
  return "pending";
}

type ClaimedRefund = {
  id: string;
  merchant_refund_id: string;
  amount: number;
  status: string;
  attempts: number;
  merchant_order_id: string;
  order_id: string;
};

export async function processRefund(r: ClaimedRefund): Promise<string> {
  const db = adminDb();
  try {
    const result = r.status === "pending"
      ? await phonepe.refund({
          merchantRefundId: r.merchant_refund_id,
          originalMerchantOrderId: r.merchant_order_id,
          amountPaise: Math.round(Number(r.amount) * 100),
        })
      : await phonepe.getRefundStatus(r.merchant_refund_id);

    const newStatus = result.state === "COMPLETED" ? "success" : result.state === "FAILED" ? "failed" : "processing";
    await db.from("refunds").update({ status: newStatus, raw: result.raw }).eq("id", r.id);
    if (newStatus === "success") await notifyRefundDone(r.order_id, Number(r.amount));
    return newStatus;
  } catch (e) {
    // Network or API error: try again later; after 5 tries it stays 'failed' for the admin to handle.
    const failed = r.attempts >= 5;
    await db.from("refunds")
      .update({ status: failed ? "failed" : r.status, raw: { error: String((e as Error).message).slice(0, 500) } })
      .eq("id", r.id);
    return failed ? "failed" : "retry";
  }
}

export async function syncRefundById(merchantRefundId: string): Promise<string> {
  const db = adminDb();
  const { data } = await db
    .from("refunds")
    .select("id, merchant_refund_id, amount, status, attempts, order_id, payments!inner(merchant_order_id)")
    .eq("merchant_refund_id", merchantRefundId)
    .maybeSingle();
  if (!data || data.status === "success") return "ignored";
  return processRefund({
    ...data,
    status: "processing",
    merchant_order_id: (data as any).payments.merchant_order_id,
  } as ClaimedRefund);
}

async function notifyRefundDone(orderId: string, amount: number) {
  const db = adminDb();
  const { data: order } = await db.from("orders").select("user_id, profiles!orders_user_id_fkey(email)").eq("id", orderId).single();
  const email = (order as any)?.profiles?.email;
  if (email) {
    await db.from("email_outbox").insert({ to_email: email, template: "refund_completed", payload: { order_id: orderId, amount } });
  }
}
