-- Green Basket: scheduled jobs (Supabase pg_cron + pg_net)
--
-- Before these jobs can call the Edge Functions, store two secrets in Supabase Vault
-- (Dashboard -> Project Settings -> Vault, or SQL below; see docs/SETUP.md):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<long random string>', 'cron_secret');   -- same value as the CRON_SECRET function secret
--
-- pg_cron times are UTC. India is UTC+5:30.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Calls an Edge Function with the shared cron secret
create or replace function public.call_edge_function(p_name text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'call_edge_function: project_url / cron_secret missing from Vault';
    return null;
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end $$;
revoke execute on function public.call_edge_function(text) from public, anon, authenticated;

-- Every minute: free stock and slots held by unpaid online orders
select cron.schedule('expire-stale-orders', '* * * * *', $$select public.expire_stale_orders()$$);

-- Every minute: send queued emails (order updates)
select cron.schedule('email-worker', '* * * * *', $$select public.call_edge_function('email-worker')$$);

-- Every 2 minutes: check pending PhonePe payments and refunds
select cron.schedule('payments-reconcile', '*/2 * * * *', $$select public.call_edge_function('payments-reconcile')$$);

-- Daily 00:05 IST (18:35 UTC): open delivery slots for the next 7 days
select cron.schedule('generate-slots', '35 18 * * *', $$select public.generate_slots(7)$$);

-- The weekly extra backup to Cloudflare R2 runs from GitHub Actions (.github/workflows/backup.yml),
-- because it needs pg_dump.

-- Housekeeping: delete sent emails older than 30 days, daily 03:30 IST
select cron.schedule('email-cleanup', '0 22 * * *',
  $$delete from public.email_outbox where status = 'sent' and sent_at < now() - interval '30 days'$$);
