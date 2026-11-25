# Green Basket: GitHub and Independent Copies

1. [Put the code on GitHub](#1-put-the-code-on-github): **you** run these commands. Claude never commits or pushes.
2. [After the first push](#2-after-the-first-push)
3. [How someone sets up their own independent copy](#3-how-someone-sets-up-their-own-independent-copy)
4. [How customers and staff work on a live store](#4-how-customers-and-staff-work-on-a-live-store)

---

## 1. Put the code on GitHub

### Before you push: check what will be uploaded
Open the VS Code terminal in the `Green Basket` folder and run:
```bash
git status
```
Make sure **none** of these appear in the list (they are secret or generated, and `.gitignore` already excludes them):
`apps/web/.env.local`, `supabase/functions/.env`, `node_modules/`, `dist/`, `supabase/.temp/`

The `.env.example` files **should** appear. They contain no real keys.

> **Public or private repository?** The `docs/` folder contains your budget documents, and the root folder has your brand PDFs. If the repository is **public**, anyone can see them. Recommendation: keep it **private** and invite people (section 2), or move the budget `.docx` files and brand PDFs out of the folder before pushing.

### The commands
GitHub's page shows `echo …`, `git init` and `git add README.md`. **Skip those**: this folder is already a git repository and already has a README. Run these instead, one at a time:

```bash
# one-time: tell git who you are (use your GitHub name and email)
git config user.name "Your Name"
git config user.email "you@example.com"

# stage everything, then review the list once more
git add -A
git status

# your first commit
git commit -m "Initial commit: Green Basket"

# name the branch main and connect it to GitHub
git branch -M main
git remote add origin https://github.com/bluenovatechin/Green-Basket.git
git push -u origin main
```
The first `git push` opens a browser window to sign in to GitHub. Approve it.

If you get `remote origin already exists`, run `git remote set-url origin https://github.com/bluenovatechin/Green-Basket.git` and push again.

### Saving later changes
```bash
git add -A
git commit -m "Short description of what changed"
git push
```

---

## 2. After the first push

1. **Actions tab:** the **CI** workflow runs on every push. It runs the database tests, builds the website and type-checks the server functions. A green tick means everything passed.
2. **Weekly backup workflow:** it skips quietly until you add its secrets (SETUP.md step 8). No failure emails until then.
3. **Let others use it.** Choose one:
   - **Team members working on *your* store:** Settings → Collaborators → *Add people*.
   - **People who should start *their own* store from this code:** Settings → General → tick **Template repository**. Visitors then get a green **"Use this template"** button that creates a fresh, separate copy in their own GitHub account. If the repository is private, they need access first.
4. **Optional:** Settings → Branches → protect `main` (require the CI check to pass before merging).

---

## 3. How someone sets up their own independent copy

Every copy is **completely separate**: its own database, customers, orders, payments, emails and photos. **Nothing is shared** with your Green Basket store, because each copy uses its own accounts and keys. The keys are never in GitHub.

| What | Shared between copies? |
|---|---|
| Code (this repository) | Yes, everyone starts from the same code |
| Database, customers, orders | **No**, each copy has its own Supabase project |
| Logins (Google / email) | **No**, each copy has its own Supabase Auth and Google OAuth app |
| Payments | **No**, money goes to each owner's own PhonePe account |
| Emails, photos, backups | **No**, each owner's own Brevo and Cloudflare R2 |
| Website address | **No**, each owner's own domain and Cloudflare Pages |

### Steps for the new owner
Detailed clicks for each service are in [KEYS-AND-ACCOUNTS.md](KEYS-AND-ACCOUNTS.md) and [SETUP.md](SETUP.md).

1. **Get the code:** "Use this template" (or fork) → clone it to your computer → `npm install`.
2. **Create your own accounts:** Supabase (choose region **Mumbai** for India), Cloudflare, Brevo, PhonePe, Google Cloud (for "Continue with Google"). Turn on 2FA everywhere.
3. **Fill in your own keys:**
   - copy `apps/web/.env.example` → `apps/web/.env.local`
   - copy `supabase/functions/.env.example` → `supabase/functions/.env`
4. **Create your database** (all tables, rules and scheduled jobs in one go):
   ```bash
   npx supabase@latest login
   npx supabase@latest link --project-ref YOUR-PROJECT-REF
   npx supabase@latest db push --remote
   ```
   Optional demo products: paste `supabase/seed.sql` into Supabase → SQL Editor → Run. For a real store, add your own pincodes, slots and products from the admin panel instead.
5. **Login setup in Supabase → Authentication:** Site URL, email code templates, Google provider, Brevo SMTP (KEYS-AND-ACCOUNTS.md, Part C).
6. **Server functions:**
   ```bash
   npx supabase@latest secrets set --env-file supabase/functions/.env
   npx supabase@latest functions deploy
   ```
   Then create the two Vault secrets `project_url` and `cron_secret` (SETUP.md step 5).
7. **Website:** Cloudflare Pages → connect *your* repository → build command `npm run build`, output `apps/web/dist`, plus the 3 `VITE_…` variables → add your domain.
8. **Claim your store:** open your website → log in → a banner says **"This store has no owner yet"** → **Claim this store**. You are now the admin.
   - Only the **first** person can claim it. After that the banner disappears for everyone.
   - Do this **right after deploying**, before sharing the link.
9. **Make it yours:** Admin → **Store settings** (name, support email and phone, fees, cash on delivery limit, pincodes), **Delivery slots**, **Products & stock**, **Staff & roles**.
   - **Branding in code** (optional): logo `apps/web/public/favicon.svg` and `icons/`, colours in `apps/web/tailwind.config.js` (`brand`), app name in `apps/web/vite.config.ts` (manifest) and `index.html`.

---

## 4. How customers and staff work on a live store

- **Customers:** anyone who opens the website and logs in (Google, or email code) **automatically gets their own new account**. There's no approval step. Each customer sees only their own addresses and orders. The database enforces this with row-level security, so one customer can never see another's data.
- **Owner (admin):** the person who claimed the store (section 3, step 8).
- **Staff:** a new packer or rider first logs in once (that creates their account), then the admin opens **Admin → Staff & roles**, enters their email and picks **Packer** or **Rider**. For password logins, the admin can also create the account in Supabase → Authentication → Users → *Add user* (tick *Auto Confirm*).
- **Blocking:** Admin → **Customers** → *Block* stops an account from placing orders.

---

## Your own Green Basket project: pending database updates
Your Supabase project still needs the last two updates (live tracking, Customers page, Claim store):
```bash
npx supabase@latest db push --remote
```
Type `Y`. It should list `…0006_realtime_customers.sql` and `…0007_claim_store.sql`. You already have an admin account, so the "Claim this store" banner will not appear on your store.
