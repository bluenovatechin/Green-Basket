# Green Basket: Engineering Design

Fresh fruit and vegetable delivery for one city, built so it stays cheap as orders grow.
This document explains how the system is put together and why. Setup steps are in [SETUP.md](SETUP.md).

**Contents**
1. [Goals and constraints](#1-goals-and-constraints)
2. [Architecture](#2-architecture)
3. [Repository layout](#3-repository-layout)
4. [Data model](#4-data-model)
5. [Order lifecycle](#5-order-lifecycle)
6. [Conflicts and how they are handled](#6-conflicts-and-how-they-are-handled)
7. [Payments (PhonePe)](#7-payments-phonepe)
8. [Login and email](#8-login-and-email)
9. [Security](#9-security)
10. [Scheduled jobs](#10-scheduled-jobs)
11. [Performance and scaling](#11-performance-and-scaling)
12. [Reliability, backups and monitoring](#12-reliability-backups-and-monitoring)
13. [Testing](#13-testing)
14. [Environments and deployment](#14-environments-and-deployment)
15. [Mobile apps](#15-mobile-apps)
16. [Known limits and roadmap](#16-known-limits-and-roadmap)

---

## 1. Goals and constraints

| Goal | Decision |
|---|---|
| Very low fixed cost (≈ ₹3,300/month at launch) | Serverless: Cloudflare Pages (free) + Supabase Pro. No servers to rent or patch. |
| Never oversell, never double-book a slot, never double-charge | All money, stock and slot changes happen inside **single Postgres transactions** with row locks. |
| Works on cheap Android phones on 4G | One small React PWA, product photos shrunk to WebP ≤ 800 px and cached on the phone. |
| Small team, no DevOps | Managed services, one database, business rules in SQL functions, workers as Edge Functions. |
| Can grow to 20,000+ orders/month without a rewrite | Standard Postgres, stateless frontend, queue-based background work. |

**Decisions for now:** login codes and order updates go by **email** (Supabase Auth + Brevo). WhatsApp can be added later as another channel on the same email queue (§16).

## 2. Architecture

```
 Customers / Admin / Riders (phone or PC browser, PWA; Android app later via TWA)
        │  HTTPS
        ▼
 ┌────────────────────────────┐        ┌──────────────────────────────┐
 │ Cloudflare Pages (free)    │        │ Cloudflare R2                │
 │ React PWA: shop, /admin,   │        │ product photos (public, CDN) │
 │ /rider  (static files)     │        │ weekly encrypted DB backups  │
 └─────────────┬──────────────┘        └──────────────▲───────────────┘
               │ supabase-js (anon key + user JWT)    │ upload (admin only)
               ▼                                      │
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Supabase (Mumbai)                                                    │
 │                                                                      │
 │  Auth ── email OTP ──► Brevo SMTP                                    │
 │                                                                      │
 │  PostgREST API ──► Postgres                                          │
 │     reads: tables under Row-Level Security                           │
 │     writes: SQL functions (place_order, cancel_order, …)             │
 │                                                                      │
 │  Edge Functions (Deno)                                               │
 │     payment-create / payment-status   ◄── customer                   │
 │     payment-webhook                   ◄── PhonePe                    │
 │     payments-reconcile, email-worker  ◄── pg_cron (every 1–2 min)    │
 │     product-image-upload              ──► R2                         │
 │                                                                      │
 │  pg_cron: expire unpaid orders, open slots nightly, call workers     │
 └──────────────┬───────────────────────────────┬───────────────────────┘
                ▼                               ▼
        PhonePe Payment Gateway          Brevo (order emails)
```

**Why this shape**
- **Business rules live in the database** (SQL functions in `supabase/migrations/…_logic.sql`). The database is the only place that sees every concurrent request, so it is the only place that can guarantee "no overselling" with simple locks. The web app can't bypass the rules, because it has no write access to orders, stock or payments tables.
- **Reads go direct** through Supabase's API with row-level security. That means no API server to build or pay for.
- **Side effects (emails, refunds) use a queue in the database (the outbox pattern).** The order change and the "send email" record commit together, and a worker sends it afterwards with retries. A Brevo or PhonePe outage never blocks or loses an order.

## 3. Repository layout

```
apps/web/                     React + Vite + Tailwind PWA (shop, /admin, /rider)
  src/lib/                    supabase client, data hooks, formatting, error messages
  src/pages/customer|admin|rider/
  public/                     icons, _headers, .well-known/assetlinks.json (Play Store link)
supabase/
  migrations/0001_schema      tables, enums, indexes
  migrations/0002_logic       all business rules (functions + triggers)
  migrations/0003_security    row-level security + grants
  migrations/0004_schedules   pg_cron jobs (Supabase only)
  functions/                  Edge Functions + _shared helpers
  seed.sql                    sample catalogue, pincodes, slot templates
tests/                        database tests (run the real migrations in PGlite)
.github/workflows/            CI (tests + build + type-check) and weekly backup
docs/                         this file, SETUP.md, budget
```

## 4. Data model

```
auth.users ─1:1─ profiles(role: customer|admin|packer|rider)
profiles ─1:n─ addresses (pincode must be in service_pincodes)
categories ─1:n─ products(unit, stock_qty) ─1:n─ product_variants(label, pack_qty, price, mrp)
slot_templates ──(nightly generate_slots)──► delivery_slots(date, time, capacity, booked, cutoff_at)
orders(address snapshot, slot, status, payment_method/status, totals, rider)
   ├─1:n─ order_items (price + name snapshot, is_unavailable)
   ├─1:n─ order_events (audit log of every status change)
   ├─1:n─ payments (one row per PhonePe attempt)
   └─1:n─ refunds
stock_movements (every stock change with reason), price_history, email_outbox, settings (one row)
```

Key choices:
- **Stock is kept in a base unit per product** (grams, pieces, bunches). "500 g" and "1 kg" tomato packs draw from one pool: a 1 kg pack reserves 1000 g.
- **`stock_qty` means "still available to sell".** It drops when an order is placed (reservation) and rises when one is cancelled or expires. The *Buying list* shows what has been ordered for a date, so the morning mandi purchase matches real orders.
- **Orders hold snapshots** of the address, product names and prices. Editing a product or address later never changes an old order or invoice.
- **Money is `numeric(10,2)` in rupees.** It is converted to paise only at the PhonePe boundary.
- **Times are `timestamptz`.** Slot dates and cut-offs are calculated in `Asia/Kolkata`.

## 5. Order lifecycle

```
                      ┌──────────── payment fails/expires ──────────► payment_failed
                      │                                               (stock + slot released)
 checkout ─► pending_payment ── PhonePe success ──┐
   (online)          │                            ▼
 checkout ──────────────────────────────────► placed ─► confirmed ─► packed ─► out_for_delivery ─► delivered
   (COD)                                          │          │          │  ▲           │
                                                  └──────────┴──────────┴──┼── cancel ─┘ (admin; customer only up to confirmed)
                                                                           └─ delivery failed: back to packed
```

| Transition | Who | Function |
|---|---|---|
| → placed / pending_payment | customer | `place_order` |
| pending_payment → placed | server (PhonePe) | `confirm_online_payment` |
| pending_payment → payment_failed | scheduler | `expire_stale_orders` |
| placed → confirmed → packed | admin, packer | `set_order_status` |
| packed → out_for_delivery | admin, assigned rider | `set_order_status` (rider must be assigned) |
| out_for_delivery → delivered | admin, assigned rider | `complete_delivery` (COD needs cash/UPI) |
| → cancelled | customer (≤ confirmed), admin (any open) | `cancel_order` |

Every status change writes an `order_events` row (who, when, note) and, for placed / out for delivery / delivered / cancelled, queues an email. Both happen in one trigger, `on_order_status_change`, so no code path can forget them.

## 6. Conflicts and how they are handled

| Conflict | What could go wrong | How it is prevented |
|---|---|---|
| Two customers buy the last 2 kg of tomatoes | Overselling | `UPDATE products SET stock_qty = stock_qty - need WHERE id = … AND stock_qty >= need`. The row lock makes the second buyer wait, and then their update matches no row → `OUT_OF_STOCK`. The whole order rolls back. |
| Order has 5 items, the 4th is out of stock | Items 1–3 stay reserved | Everything runs in one transaction. Any error rolls back every reservation and the slot booking. Tested. |
| Last place in a slot | Slot over-booked | `SELECT … FOR UPDATE` on the slot row, check `booked < capacity`, then increment, in the same transaction. |
| Customer double-taps "Place order", or the network drops after success | Two orders | Each checkout screen sends an `idempotency_key`. `(user_id, key)` is unique and a per-user advisory lock serialises the check. A repeat returns the existing order. |
| Deadlocks between concurrent orders/cancels | Requests stuck | Fixed lock order everywhere: payment → order → slot → products sorted by id. |
| Price changed while the item was in the cart | Charging the wrong price | The cart price is display-only. `place_order` reads prices from the database. Checkout refreshes displayed prices first. |
| Customer pays but the PhonePe webhook is lost | Paid order stuck as unpaid | Three independent paths confirm a payment: webhook, the "return from PhonePe" page (`payment-status`), and the reconciler every 2 min. All call the same **idempotent** `confirm_online_payment`. |
| Payment succeeds after the order expired | Money taken, no order | `confirm_online_payment` sees the order is no longer waiting and creates an automatic **refund**. Tested. |
| Fake "payment success" webhook | Free orders | The webhook's `Authorization` hash is checked, **and** we ignore its body and ask PhonePe's status API, verifying the amount matches. |
| Payment for the wrong amount | Under-payment | `syncPayment` refuses to confirm if PhonePe's amount ≠ our amount and logs it for review. |
| Customer abandons PhonePe page | Stock held forever | Online orders hold stock for `payment_timeout_minutes` (15). `expire_stale_orders` releases them every minute. Retry is allowed until then. |
| Item missing at packing | Customer charged for it | `mark_item_unavailable` removes it from the bill. Prepaid → refund for the difference. All items missing → order cancelled and refunded. |
| Rider marks the wrong order | Wrong delivery | Riders can only see and change orders assigned to them (row-level security + function checks). |
| Email or PhonePe down | Lost emails / refunds | Outbox rows retry with back-off (1, 4, 9, 16 min…), up to 5 attempts, then stay "failed" for the admin. |
| Admin changes capacity below bookings | Negative space | Capacity can go below `booked`. The slot simply shows as full. `booked` can never go below 0. |

## 7. Payments (PhonePe)

```
Customer          Web app                 Edge Functions              Postgres                PhonePe
   │ Place order ───►│ rpc place_order ──────────────────────────────►│ reserve stock+slot
   │                 │◄─────────────── order (pending_payment) ───────│
   │                 │ payment-create ────►│ create_payment_attempt ──►│ payments row
   │                 │                     │ POST /checkout/v2/pay ───────────────────────────►│
   │                 │◄── redirect_url ────│                                                   │
   │ ── pays on PhonePe page ─────────────────────────────────────────────────────────────────►│
   │                                       │◄──────────────── webhook (Authorization hash) ────│
   │                                       │ GET order status ────────────────────────────────►│
   │                                       │ confirm_online_payment ──►│ order → placed, email queued
   │ ◄─ redirected to /orders/:id?payment=return                       │
   │                 │ payment-status ────►│ (same sync, in case the webhook is late)
```

- **One `payments` row per attempt** (`merchant_order_id = GB2611250001P1`, `…P2`). A failed attempt keeps the order open for retry, up to 5 attempts within the time window.
- **Refunds** are rows in `refunds`. The reconciler sends them to PhonePe, then polls them until they complete (`pending → processing → success`). After 5 failed tries the status is `failed`, which shows on the admin dashboard so someone can refund manually in the PhonePe dashboard.
- **All PhonePe specifics** (URLs, token, payload shape) are isolated in `supabase/functions/_shared/phonepe.ts`. Check them against PhonePe's current docs during integration and test end-to-end in the sandbox first.
- COD orders are `placed` immediately. The rider records **cash** or **UPI QR** at delivery, which feeds the cash reconciliation on the dashboard.

## 8. Login and email

- **Login:** Supabase Auth with **email OTP** (passwordless). The code email is sent by Supabase through **Brevo SMTP** (custom SMTP in Supabase settings). **Cloudflare Turnstile** is checked by Supabase Auth's CAPTCHA setting, and Supabase's built-in rate limits stop code-spamming.
- **Order emails:** placed, out for delivery, delivered, cancelled, item unavailable, refund started and refund completed. They are queued in `email_outbox` and sent by `email-worker` through Brevo's API every minute.
- **Volume and cost:** Brevo's free plan allows **300 emails a day**, counting both login codes and order emails. Three order emails per order plus logins fills that at roughly **80 orders/day**. Move to Brevo's paid plan before that. To save emails, the "delivered" email can be turned off in `on_order_status_change`.
- **Deliverability:** send from your own domain with SPF, DKIM and DMARC records on Cloudflare DNS (Brevo shows the exact records). Without them, codes land in spam.

## 9. Security

**Principles:** least privilege, server-side validation of everything, no secrets in the browser.

| Layer | Control |
|---|---|
| API roles | Migration 0003 starts by **revoking everything** from `anon`/`authenticated`, then grants back only what is needed. |
| Row-level security | On every table. Customers see only their own orders and addresses. Riders see only orders assigned to them. Packers can't see prices history or staff. `email_outbox` has no policies (server only). |
| Column grants | `products.stock_qty`, `profiles.role`, `profiles.is_blocked` and every orders/payments column are **not writable** through the API. Stock changes only through `admin_adjust_stock` (logged) or orders. Tested. |
| Functions | `SECURITY DEFINER` with a fixed `search_path`. Each one checks the caller's role. Server-only functions (`confirm_online_payment`, queue claims) are executable only by `service_role`. |
| Secrets | The service-role key, PhonePe, Brevo and R2 keys exist only as Edge Function secrets. The browser has only the public anon key. |
| Webhook | Authorization hash verified with a constant-time compare, then status re-fetched from PhonePe. |
| Workers | Called by pg_cron with a shared `x-cron-secret` stored in Supabase Vault. |
| Uploads | Admin only, image types only, ≤ 2 MB, random file names. |
| Frontend | Strict security headers (`public/_headers`), all input validated again in the database. |
| Abuse | Turnstile on login, Supabase auth rate limits, per-item quantity cap, COD limit, account blocking (`admin_set_blocked`). |
| Privacy | Weekly backups are **encrypted** (AES-256) before upload. Customer data stays in India (Mumbai region). |

## 10. Scheduled jobs

| Job | When (IST) | What |
|---|---|---|
| `expire-stale-orders` | every minute | Release stock and slots for unpaid online orders past their deadline |
| `email-worker` | every minute | Send up to 25 queued emails |
| `payments-reconcile` | every 2 min | Check payments with no result yet; send and poll refunds |
| `generate-slots` | 00:05 daily | Create slots for the next 7 days from weekly templates |
| `email-cleanup` | 03:30 daily | Delete sent emails older than 30 days |
| GitHub `backup.yml` | Sun 03:00 | Encrypted `pg_dump` to R2 |

## 11. Performance and scaling

**Launch (~3,000 orders/month, ~100/day):** one small Supabase compute (Micro, included in Pro) is far more than enough. The hot path, `place_order`, is a handful of indexed single-row updates.

**What grows, and the plan:**

| Pressure | Signal | Action | Cost |
|---|---|---|---|
| DB CPU / connections | Supabase reports > 70% CPU | Upgrade compute (Small → Medium) | ≈ ₹1,300–5,300/month more |
| Hot rows (one popular product) | Lock waits at peak | Already short transactions. If needed, split stock per slot date. | – |
| Catalogue reads | Many visitors | Products are cached 60 s on the phone. Add Cloudflare caching for a public catalogue endpoint if needed. | ₹0 |
| Images | Bandwidth | R2 has no download fees, and photos are cached on phones for 30 days. | ₹0 |
| Emails | > 300/day | Brevo paid plan | small |
| Second city | Business | Add pincodes and slot templates. Add `city_id` to slots/pincodes when cities need separate stock. | ₹0 |

Indexes exist for every hot lookup: orders by user, slot, status, rider, pending-payment expiry; open payments; open refunds; ready emails.

## 12. Reliability, backups and monitoring

- **Backups:** Supabase Pro daily backups (7 days) plus a weekly encrypted dump in R2 (keep 8–12 weeks with an R2 lifecycle rule). **Test a restore once a quarter** into a scratch project.
- **Monitoring:** UptimeRobot (free) on the shop URL. Supabase dashboard for database health and Edge Function logs. Sentry (free) can be added to the web app for frontend errors.
- **What to watch weekly:** `refunds` with status `failed`, `email_outbox` with status `failed`, orders stuck in `pending_payment` > 1 hour (should be none), low-stock list.
- **Graceful degradation:** if PhonePe is down, turn off online payment in Settings and COD still works. If Brevo is down, emails queue and send later.

## 13. Testing

- `npm run test:db` runs **13 database tests** against the real migrations in PGlite (Postgres compiled to WebAssembly), with a stand-in for Supabase's auth schema and roles. They cover overselling, partial-order rollback, slot capacity and cut-off, idempotency, COD limit, cancellation release, the online payment flow, late payments → refund, retry after failed payment, the packer/rider flow, item unavailable → refund, row-level security and column protection, stock adjustments, the buying list, and email retries.
- `npm run build` type-checks and builds the web app. CI also runs `deno check` on Edge Functions.
- **Not covered automatically** (do manually before launch, see SETUP.md checklist): PhonePe sandbox end-to-end, real email delivery, pg_cron jobs on Supabase, true concurrent load (row locks make it safe by design; a k6 script can confirm).

## 14. Environments and deployment

| | Development | Production |
|---|---|---|
| Supabase | separate free project `greenbasket-dev` | Pro project `greenbasket-prod` (Mumbai) |
| PhonePe | sandbox | production keys |
| Web | `npm run dev` / Pages preview branches | Cloudflare Pages on `main` → greenbasket.in |

Deploy order: `supabase db push` (migrations) → `supabase functions deploy` → set secrets → web deploys automatically from Git. **Never edit production tables by hand.** Every schema change is a new migration file, tested by CI first.

## 15. Mobile apps

- **Now:** the PWA installs from the browser on Android and iPhone.
- **Android Play Store:** wrap the same site as a Trusted Web Activity (Bubblewrap). App ID `in.greenbasket.app`, verified by `public/.well-known/assetlinks.json` (fill in the Play App Signing SHA-256). Updates to the website appear in the app instantly.
- **iOS App Store (later):** Capacitor build of the same React code, with Codemagic for cloud builds. Store rules need in-app account deletion (currently a "request deletion" email link) and a privacy policy page.

## 16. Known limits and roadmap

| Item | Status / plan |
|---|---|
| WhatsApp updates and codes | Not now (by decision). Add a `channel` column to `email_outbox`, then a `whatsapp-worker` using Meta Cloud API, and a Supabase "Send SMS Hook" for WhatsApp login codes. |
| Google Maps address autocomplete | Not yet. Pincode check only. Add Places Autocomplete on the address form with a daily quota cap. `lat`/`lng` columns already exist. |
| Coupons / wallet | Not built. Refunds go back to the original payment method. |
| Invoices with GST | Not built. Order email and packing slip only. Add once GST registration is decided. |
| Delivery tracking map | Not built. Rider screen has Call and Map buttons. |
| Account self-deletion | Request by email. Add an in-app delete flow before an iOS release. |
| Multiple stores / cities with separate stock | Single stock pool. See §11. |
