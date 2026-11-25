# Green Basket

Fresh fruit and vegetable delivery for one city: a customer shop, an admin panel and a rider screen, in one installable web app (PWA).

**Stack:** React + Vite + Tailwind PWA on Cloudflare Pages · Supabase (Postgres, Auth, Edge Functions, pg_cron) in Mumbai · PhonePe Payment Gateway · Brevo email · Cloudflare R2 for photos and backups.

| Area | URL | Who |
|---|---|---|
| Shop | `/` | customers (email login code, COD or PhonePe) |
| Admin | `/admin` | admin, packer: orders, buying list, products & stock, daily prices, slots, settings, staff |
| Rider | `/rider` | riders: today's deliveries, call, map, mark delivered + cash/UPI |

## Quick start

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # add your Supabase URL + anon key
npm run dev                                     # http://localhost:5173
npm run test:db                                 # 13 database tests (no Supabase needed)
```

## Documentation

- [docs/ENGINEERING.md](docs/ENGINEERING.md): system design, data model, order lifecycle, conflict handling, security, scaling
- [docs/SETUP.md](docs/SETUP.md): accounts, deployment, launch checklist, daily operations
- [docs/KEYS-AND-ACCOUNTS.md](docs/KEYS-AND-ACCOUNTS.md): which keys go where, registrations, 2FA
- [docs/GITHUB-AND-NEW-COPY.md](docs/GITHUB-AND-NEW-COPY.md): pushing to GitHub, and setting up your own independent copy ("Claim this store")
- `docs/Green-Basket-Budget*.docx`: running-cost budget

## Repository

```
apps/web/              PWA (customer, admin, rider)
supabase/migrations/   schema, business logic, security, schedules
supabase/functions/    payments, webhook, reconciler, email worker, image upload
tests/                 database tests (PGlite)
.github/workflows/     CI + weekly encrypted backup
```
