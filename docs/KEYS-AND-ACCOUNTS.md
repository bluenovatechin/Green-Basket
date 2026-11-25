# Green Basket: Your To-Do List (Keys, Accounts, Registrations)

This is everything **you** need to do from your side. The code is ready. It only needs your accounts, keys and business documents.

There are **2 files** where you paste keys:

| File | What goes in it | Secret? |
|---|---|---|
| `apps/web/.env.local` | 3 public values for the website | No, these are public |
| `supabase/functions/.env` | Server keys: Brevo, PhonePe, R2 | **Yes, keep private** |

Both files are already excluded from GitHub. Never paste these keys into WhatsApp, email or screenshots.

---

## Part A: Security first (do this before anything else)

### 1. Use a company email for every account
Create something like **admin@greenbasket.in** (after the domain is bought, Cloudflare Email Routing forwards it to your Gmail for free). Until then, make a new Gmail only for the business, such as greenbasket.business@gmail.com. **Don't use a personal email or a developer's email.**

### 2. Turn on 2FA (two-factor authentication) everywhere
2FA means that after the password, the site also asks for a 6-digit code from your phone. Even if someone steals your password, they can't log in.

- **Use an authenticator app**, not SMS: *Google Authenticator*, *Microsoft Authenticator* or *Authy* (all free).
- When you turn on 2FA, each site shows **backup/recovery codes**. **Save them** (print them, or keep them in the password manager). If you lose your phone, these codes are the only way back in.

| Account | Where to turn on 2FA | Must have? |
|---|---|---|
| Business Gmail / Google | Google Account → Security → 2-Step Verification | ✅ Must |
| Supabase | Account → Security → Multi-factor authentication | ✅ Must (holds all customer data) |
| Cloudflare | My Profile → Authentication → Two-Factor | ✅ Must (controls the domain and website) |
| GitHub | Settings → Password and authentication → 2FA | ✅ Must (holds the code) |
| Hostinger | Account → Security → 2FA | ✅ Must (owns the domain) |
| PhonePe Business | Follow the app/dashboard security settings | ✅ Must (money) |
| Brevo | My Profile → Security → 2FA | ✅ Should |

### 3. Use a password manager
Use **Bitwarden** (free) or Google Password Manager. Give every account a different long password. Store in it: all passwords, 2FA backup codes, the two `.env` files' values, the Supabase **database password**, and the **backup passphrase** (step 7).

### 4. Have two owners
Give a second trusted person (partner or family member) admin access on Supabase, Cloudflare, GitHub and PhonePe. If one person is unavailable, the business isn't locked out.

---

## Part B: Business registrations to apply for

PhonePe (and later Google Play) checks that you are a real business. Start these **now**, because some take days to weeks.

| # | What | Why we need it | Where / how | Cost | Time |
|---|---|---|---|---|---|
| 1 | **PAN** (personal for a proprietorship, or the firm's PAN) | Needed for every registration below | Already have, or apply on the Income Tax site | – | – |
| 2 | **Current bank account** in the business name | PhonePe sends your sales money here | Any bank (SBI, HDFC, ICICI, local co-op bank) | Bank's rules | 1–7 days |
| 3 | **Udyam Registration (MSME)** | Free proof that your business exists. Accepted for payment gateway KYC | udyamregistration.gov.in (needs Aadhaar + PAN) | **Free** | Same day |
| 4 | **FSSAI Registration** | Required by law for any food business, including selling fruits and vegetables. Payment gateways may ask for it | foscos.fssai.gov.in → *Basic Registration* if turnover is under ₹12 lakh a year; *State Licence* above that | About ₹100 a year (Basic) | About 7–30 days |
| 5 | **Shop & Establishment / Gumasta licence** | Local business licence for your shop/storage place; also accepted as business proof | Your municipal corporation / nagarpalika (Gujarat: Shop & Establishment online portal) | Small fee | 1–2 weeks |
| 6 | **GST registration** | Fresh, unprocessed fruits and vegetables are generally GST-exempt, and small turnover may not need GST. **Ask a CA** whether you need it | gst.gov.in, only if your CA says so | Free | 1–2 weeks |
| 7 | **Website policy pages** | PhonePe **won't activate** live payments without them: Privacy Policy, Terms & Conditions, Refund & Cancellation Policy, Shipping/Delivery Policy, Contact Us | We add these pages to the website (tell me and I'll create them) | Free | 1 day |
| 8 | **D-U-N-S number** (later, for Google Play as a company) | Lets you publish the app as "Green Basket", not a personal name | dnb.com → D-U-N-S request | Free | About 2–4 weeks |

> **Minimum to start PhonePe KYC:** PAN + bank account + one business proof (Udyam is easiest) + the website with policy pages.

---

## Part C: Create accounts and fill in the keys (in this order)

### Step 1: Domain (Hostinger → Cloudflare)
1. Buy **greenbasket.in** on Hostinger (2–3 years).
2. Create a **Cloudflare** account → *Add a site* → greenbasket.in → Free plan.
3. Cloudflare shows 2 nameservers → in Hostinger → Domains → Nameservers → *Change* → paste Cloudflare's. Wait until Cloudflare says **Active** (minutes to a few hours).
4. Cloudflare → Email → **Email Routing** → forward `support@greenbasket.in` and `orders@greenbasket.in` to your Gmail.

*No keys to paste yet.*

### Step 2: Supabase (database and login)
1. supabase.com → New project → name **greenbasket-prod**, region **Mumbai**, create a strong **database password** (save it in the password manager).
2. Billing → upgrade to **Pro**, and **keep "Spend cap" ON**.
3. Project Settings → **API**: copy and paste into `apps/web/.env.local`:
   - Project URL → `VITE_SUPABASE_URL=`
   - anon / publishable key → `VITE_SUPABASE_ANON_KEY=`
   - ⚠️ The **service_role / secret** key goes **nowhere** in these files. Supabase gives it to the server automatically. Never put it in the web app.
4. For testing, make a second **free** project called **greenbasket-dev** and use its keys on your computer first.

### Step 3: Brevo (emails)
1. brevo.com → sign up with the business email.
2. **Senders, Domains & Dedicated IPs → Domains → Add domain** greenbasket.in. Brevo shows some DNS records, which you add in Cloudflare → DNS → *Add record*, then click *Verify* in Brevo. (This stops your emails going to spam.)
3. **Senders → Add sender:** `orders@greenbasket.in`, name *Green Basket*.
4. **SMTP & API → API Keys → Generate** → paste into `supabase/functions/.env`:
   - `BREVO_API_KEY=`
5. **SMTP & API → SMTP tab → Generate SMTP key.** This one goes into the **Supabase dashboard**, not a file: Supabase → Authentication → Emails → **SMTP Settings**:
   - Host `smtp-relay.brevo.com`, Port `587`, Username = the SMTP login shown in Brevo, Password = the SMTP key, Sender `orders@greenbasket.in`, Name `Green Basket`.

### Step 4: Cloudflare R2 (photos) and Turnstile (bot check)
1. Cloudflare → **R2** → add a payment card (needed even for the free tier) → *Create bucket* **greenbasket-images**.
   - Bucket → Settings → **Custom Domains** → add `img.greenbasket.in` → paste `https://img.greenbasket.in` into `R2_PUBLIC_URL=`
2. Create a second bucket **greenbasket-backups** and **don't** make it public.
3. R2 page → copy **Account ID** → `R2_ACCOUNT_ID=`
4. R2 → **Manage API tokens → Create API token** → permission *Object Read & Write* → both buckets → copy:
   - Access Key ID → `R2_ACCESS_KEY_ID=`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY=` (shown **only once**, so copy it immediately)
5. Cloudflare → **Turnstile → Add widget** → domain `greenbasket.in` (also add `localhost` for testing) → mode *Managed*:
   - **Site Key** → `apps/web/.env.local` → `VITE_TURNSTILE_SITE_KEY=`
   - **Secret Key** → Supabase dashboard → Authentication → **Attack Protection / Bot and Abuse Protection** → enable CAPTCHA → Turnstile → paste.

### Step 5: Scheduler secret (already done for you)
`CRON_SECRET` in `supabase/functions/.env` is already filled with a random value. After the database is set up, open Supabase → **SQL Editor** and run, replacing the two values:
```sql
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('PASTE THE SAME CRON_SECRET VALUE HERE', 'cron_secret');
```

### Step 6: PhonePe Payment Gateway
1. Apply at PhonePe Business (business.phonepe.com) → **Payment Gateway**. Submit KYC with the documents from Part B.
2. **Before signing, ask for these in writing:** the UPI rate, the card rate, and settlement time (next day, T+1).
3. Once approved for testing, open the dashboard → **Developer Settings / API keys** (sandbox / UAT) → paste into `supabase/functions/.env`:
   - `PHONEPE_CLIENT_ID=`
   - `PHONEPE_CLIENT_SECRET=`
   - `PHONEPE_CLIENT_VERSION=`
4. **Webhook:** choose a username and a long password yourself → put them in `PHONEPE_WEBHOOK_USERNAME=` and `PHONEPE_WEBHOOK_PASSWORD=` → type the **same** two in PhonePe dashboard → Webhooks, with URL
   `https://YOUR-PROJECT-REF.supabase.co/functions/v1/payment-webhook`
5. Test everything in **sandbox**. When PhonePe activates the live account, replace the 3 client values with the **production** ones and change `PHONEPE_ENV=production`.
6. Also open a free **Razorpay** account as a backup and complete its KYC. It costs nothing to keep.

### Step 7: GitHub (code + weekly backup)
1. Create a **private** repository and push the code (I can do this for you when you're ready).
2. Repository → Settings → **Secrets and variables → Actions** → add:

| Secret name | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → **Connect** → *Session pooler* connection string (put your database password inside it) |
| `BACKUP_PASSPHRASE` | Make up a long password. **Save it in the password manager**: without it, backups can't be opened |
| `R2_ACCOUNT_ID` | same as in `.env` |
| `R2_ACCESS_KEY_ID` | same as in `.env` |
| `R2_SECRET_ACCESS_KEY` | same as in `.env` |
| `R2_BACKUP_BUCKET` | `greenbasket-backups` |

### Step 8: Cloudflare Pages (put the website online)
Cloudflare → Workers & Pages → Create → Pages → connect GitHub → choose the repo:
- Build command: `npm run build`
- Output directory: `apps/web/dist`
- Environment variables: `NODE_VERSION` = `22`, plus the **3 values** from `apps/web/.env.local`
- Custom domains → add `greenbasket.in`

---

## Part D: Quick checklist

**Security**
- [ ] Business email created
- [ ] Password manager set up
- [ ] 2FA on Google, Supabase, Cloudflare, GitHub, Hostinger, PhonePe, Brevo
- [ ] Backup codes saved
- [ ] Second owner added

**Business documents**
- [ ] Current bank account
- [ ] Udyam registration
- [ ] FSSAI registration applied
- [ ] Shop & Establishment licence applied
- [ ] Asked a CA about GST
- [ ] Policy pages on the website

**Accounts and keys** (✏️ = paste a value into a file)
- [ ] Domain bought and Cloudflare active
- [ ] Supabase Pro project (Mumbai) ✏️ `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Brevo domain verified ✏️ `BREVO_API_KEY`, plus SMTP key in the Supabase dashboard
- [ ] R2 buckets created ✏️ `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`
- [ ] Turnstile ✏️ `VITE_TURNSTILE_SITE_KEY`, plus the secret in the Supabase dashboard
- [ ] Vault secrets created (step 5)
- [ ] PhonePe sandbox ✏️ `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD`
- [ ] GitHub repo plus 6 backup secrets
- [ ] Cloudflare Pages connected

When the keys are filled in, tell me. I'll run the database setup, deploy the server functions and do the first test order with you.
