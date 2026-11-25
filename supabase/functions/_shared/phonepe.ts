// PhonePe Payment Gateway (Standard Checkout v2) client.
// All PhonePe-specific details live in this file. Check them against PhonePe's current developer docs
// during integration; the rest of the system only depends on the small functions exported here.
//
// Secrets: PHONEPE_ENV (sandbox|production), PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET,
//          PHONEPE_CLIENT_VERSION, PHONEPE_WEBHOOK_USERNAME, PHONEPE_WEBHOOK_PASSWORD
import { env, safeEqual, sha256Hex } from "./http.ts";

const isProd = () => (Deno.env.get("PHONEPE_ENV") ?? "sandbox") === "production";
const authUrl = () =>
  isProd()
    ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";
const baseUrl = () =>
  isProd() ? "https://api.phonepe.com/apis/pg" : "https://api-preprod.phonepe.com/apis/pg-sandbox";

export type PhonePeState = "PENDING" | "COMPLETED" | "FAILED";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;
  const res = await fetch(authUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("PHONEPE_CLIENT_ID"),
      client_secret: env("PHONEPE_CLIENT_SECRET"),
      client_version: env("PHONEPE_CLIENT_VERSION"),
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`PhonePe auth failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  cachedToken = { token: body.access_token, expiresAt: Number(body.expires_at ?? now + 600) };
  return cachedToken.token;
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(baseUrl() + path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `O-Bearer ${await token()}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`PhonePe ${path} failed: ${res.status} ${text}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return body;
}

/** Starts a payment. Returns PhonePe's order id and the page to send the customer to. */
export async function createCheckout(p: {
  merchantOrderId: string;
  amountPaise: number;
  redirectUrl: string;
  expireAfterSeconds: number;
}): Promise<{ orderId: string; redirectUrl: string; raw: unknown }> {
  const body = await call("/checkout/v2/pay", {
    method: "POST",
    body: JSON.stringify({
      merchantOrderId: p.merchantOrderId,
      amount: p.amountPaise,
      expireAfter: Math.min(3600, Math.max(300, Math.floor(p.expireAfterSeconds))),
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Green Basket order",
        merchantUrls: { redirectUrl: p.redirectUrl },
      },
    }),
  });
  return { orderId: body.orderId, redirectUrl: body.redirectUrl, raw: body };
}

/** The source of truth for whether a payment succeeded. */
export async function getOrderStatus(merchantOrderId: string): Promise<{ state: PhonePeState; amountPaise: number; orderId?: string; raw: any }> {
  const body = await call(`/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`);
  return { state: body.state, amountPaise: Number(body.amount), orderId: body.orderId, raw: body };
}

export async function refund(p: { merchantRefundId: string; originalMerchantOrderId: string; amountPaise: number }): Promise<{ state: PhonePeState; raw: any }> {
  const body = await call("/payments/v2/refund", {
    method: "POST",
    body: JSON.stringify({
      merchantRefundId: p.merchantRefundId,
      originalMerchantOrderId: p.originalMerchantOrderId,
      amount: p.amountPaise,
    }),
  });
  return { state: body.state, raw: body };
}

export async function getRefundStatus(merchantRefundId: string): Promise<{ state: PhonePeState; raw: any }> {
  const body = await call(`/payments/v2/refund/${encodeURIComponent(merchantRefundId)}/status`);
  return { state: body.state, raw: body };
}

/** PhonePe sends Authorization: SHA256("username:password") using the credentials set in its dashboard. */
export async function verifyWebhook(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const expected = await sha256Hex(`${env("PHONEPE_WEBHOOK_USERNAME")}:${env("PHONEPE_WEBHOOK_PASSWORD")}`);
  const got = authHeader.replace(/^SHA256\s*/i, "").trim().toLowerCase();
  return safeEqual(got, expected);
}
