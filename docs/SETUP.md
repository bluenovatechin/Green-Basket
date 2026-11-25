# Green Basket: Setup and Launch Runbook

Step by step, from empty accounts to a live shop. Do it first with a **dev** Supabase project and PhonePe **sandbox**, then repeat for production.

> Create every account with a **company email** (e.g. admin@greenbasket.in) and give a second trusted person access. Never use a developer's personal account.

## 0. Accounts you need

| Service | Used for | Plan |
|---|---|---|
| Hostinger | buy `greenbasket.in` | ~₹80/month equivalent |
| Cloudflare | DNS, website hosting (Pages), photos + backups (R2), Turnstile, email forwarding | Free |
| Supabase | database, login, API, Edge Functions, scheduler | Free for dev, **Pro** for production |
| Brevo | login-code and order emails | Free (300/day) |
| PhonePe Business | online payments | % per payment |
| GitHub | code, CI, weekly backup job | Free (private repo) |

## 1. Domain → Cloudflare

1. Buy `greenbasket.in` on Hostinger (buy 2–3 years).
2. Add the site in Cloudflare (Free plan). Cloudflare gives two nameservers.
3. In Hostinger → Domain → DNS / Nameservers, replace them with Cloudflare's. Wait until Cloudflare shows **Active**.
4. Cloudflare → Email → **Email Routing**: forward `support@` and `orders@` to your Gmail.

## 2. Supabase project

1. Create project **greenbasket-prod**, region **Mumbai (ap-south-1)**, strong database password (save it in a password manager). Upgrade to **Pro** and keep the **spend cap ON**.
2. From the repo root:
   ```bash
   npx supabase@latest login
   npx supabase@latest link --project-ref <your-project-ref>
   npx supabase@latest db push          # runs supabase/migrations in order
   ```
3. **Production data:** don't run `seed.sql` as it is. In SQL Editor, insert your real pincodes and slot templates (copy the patterns from `seed.sql`), then run `select public.generate_slots(7);`. On the **dev** project, run the whole `seed.sql` for sample products.
4. **Auth settings** (Authentication → Providers / Emails / URL configuration):
   - Email provider ON. "Confirm email" ON. Email OTP expiry **600** seconds.
   - Site URL `https://greenbasket.in`. Redirect URLs: add `http://localhost:5173` for dev.
   - Email templates **"Confirm signup"** and **"Magic Link"**: both must show the code, because new users get the first and returning users the second:
     ```html
     <h2>Your Green Basket login code</h2>
     <p>Enter this code in the app: <strong style="font-size:26px;letter-spacing:4px">{{ .Token }}</strong></p>
     <p>It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
     ```
   - **Custom SMTP** (Brevo, step 3): host `smtp-relay.brevo.com`, port `587`, your Brevo SMTP login and SMTP key, sender `orders@greenbasket.in`, name `Green Basket`.
   - **Bot protection:** enable CAPTCHA → Cloudflare Turnstile → paste the Turnstile **secret** (step 4).
   - Rate limits: keep the defaults or lower "emails per hour" to protect your Brevo quota.

## 3. Brevo

1. Sign up → **Senders, Domains & Dedicated IPs** → add domain `greenbasket.in`. Brevo shows DNS records (DKIM, SPF, DMARC, verification). Add them in Cloudflare DNS and click verify.
2. Add sender `orders@greenbasket.in`.
3. **SMTP & API** → create an **SMTP key** (for Supabase Auth, step 2) and an **API key** (for the `email-worker` function).

## 4. Cloudflare R2, Turnstile, Pages

1. **R2** → create bucket `greenbasket-images`. Settings → **Custom domain** `img.greenbasket.in` (public). Create bucket `greenbasket-backups` (keep **private**). Add a lifecycle rule to delete backups older than 90 days.
2. R2 → **Manage API tokens** → create a token with *Object Read & Write* on both buckets. Note the Account ID, Access Key ID and Secret.
3. **Turnstile** → add widget for `greenbasket.in` (and `localhost` for dev). Copy the **site key** (web app) and **secret** (Supabase Auth).
4. **Pages** → Create → connect the GitHub repo:
   - Build command: `npm run build`
   - Build output directory: `apps/web/dist`
   - Environment variables: `NODE_VERSION=22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Settings → API, the public anon/publishable key), `VITE_TURNSTILE_SITE_KEY`
   - Custom domain: `greenbasket.in` (and `www` redirect).

## 5. Edge Functions

1. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill it in. **Never commit this file.** Generate `CRON_SECRET` with `openssl rand -hex 32`.
2. Deploy:
   ```bash
   npx supabase@latest secrets set --env-file supabase/functions/.env
   npx supabase@latest functions deploy
   ```
   `payment-webhook`, `payments-reconcile` and `email-worker` deploy without JWT checks (see `supabase/config.toml`). They verify their own secrets.

   To deploy only the staff function (Admin → Staff → "Add a staff member" needs it):
   ```bash
   npx supabase@latest functions deploy staff-create
   ```
   It needs no secrets of its own: Supabase gives every function `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

   Product photos are stored in Supabase Storage (bucket `product-images`, created by migration 0010), so Cloudflare R2 is optional.
3. Let the scheduler call the workers. In SQL Editor:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
   ```
4. Check jobs are running:
   ```sql
   select jobname, schedule from cron.job;
   select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 20;
   ```

## 6. PhonePe

1. Create a PhonePe Business account and complete KYC (PAN, bank account, business proof; FSSAI/GST if asked). **Get the UPI and card rates in writing.**
2. Developer settings → copy the **sandbox** Client ID, Client Secret and Client Version into the function secrets (`PHONEPE_ENV=sandbox`).
3. Webhook: URL `https://<project-ref>.supabase.co/functions/v1/payment-webhook`. Choose a username and password and put them in `PHONEPE_WEBHOOK_USERNAME` / `PHONEPE_WEBHOOK_PASSWORD`. Subscribe to order and refund events.
4. Test the full flow in sandbox (success, failure, abandon, refund). Then switch to production keys and `PHONEPE_ENV=production`, and redeploy secrets.
5. Also open a **Razorpay** account as a backup gateway. It's free to keep, and not wired in yet.

## 7. First admin

1. Open the shop and log in once with the owner's email.
2. In Supabase SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'owner@example.com';
   ```
3. From then on, add packers, riders and other admins in **Admin → Staff**. They must log in once first.

## 8. GitHub

1. Push the repo (private). CI runs database tests, the web build and the Deno type check on every push.
2. For the weekly backup, add repository secrets: `SUPABASE_DB_URL` (Supabase → Connect → Session pooler URI), `BACKUP_PASSPHRASE` (store it in your password manager; you need it to restore), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET=greenbasket-backups`. Run the workflow once by hand to confirm it works.

## 9. Pre-launch checklist

- [ ] Real products, photos, prices and stock entered. Slots generated for 7 days.
- [ ] Pincodes are the real delivery area only.
- [ ] Login code email arrives in the **inbox** (not spam) on Gmail and Outlook.
- [ ] COD order: place → confirm → pack → assign rider → out for delivery → delivered (cash). The dashboard shows the cash collected.
- [ ] Online order in PhonePe **sandbox**: success, failure + retry, abandon (stock returns after 15 min), cancel after paying (refund email).
- [ ] Two phones try to buy the last pack at the same time: one succeeds, one gets "not enough stock".
- [ ] Order emails arrive (placed, out for delivery, delivered, cancelled).
- [ ] `cron.job_run_details` shows successful runs for all jobs.
- [ ] Weekly backup workflow succeeded once; a restore was tried into a scratch project.
- [ ] Privacy policy, terms and refund policy pages published (required by PhonePe and Google Play).
- [ ] UptimeRobot monitor on `https://greenbasket.in`.
- [ ] PhonePe switched to **production** keys.

## 10. Daily operations

| Time | Who | Where |
|---|---|---|
| Morning, before mandi | Admin | **Buying list** for today/tomorrow → buy what's ordered plus a buffer |
| After mandi | Admin | **Today's prices** → update prices. **Products & stock** → *Add stock* for what you bought |
| Packing | Packer | **Orders** (filter by slot) → print slip → mark items *Unavailable* if missing → *Mark packed* → assign rider |
| Delivery | Rider | `/rider` on phone → *Start delivery* → Call / Map → *Delivered · Cash/UPI* |
| End of day | Admin | **Dashboard** → check cash/UPI collected per rider, open refunds, low stock. **Products** → record *Wastage* |

## 11. Local development

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # point at the DEV Supabase project
npm run dev            # http://localhost:5173
npm run test:db        # database tests, no Supabase needed
npm run build
```
Schema changes: add a new file in `supabase/migrations/` (never edit an applied one), add a test in `tests/`, run `npm run test:db`, then `supabase db push` to dev, then prod.
