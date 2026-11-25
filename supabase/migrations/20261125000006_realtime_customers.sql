-- 1. Live order tracking: stream changes to the orders table (Supabase Realtime respects row-level security,
--    so customers only receive their own orders, riders only theirs).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
end $$;

-- 2. Customer list for the admin panel, with order stats
create or replace function public.admin_customers(p_search text default null, p_limit int default 100)
returns table (
  id uuid, email text, full_name text, phone text, is_blocked boolean, created_at timestamptz,
  orders_count bigint, delivered_count bigint, total_spent numeric, last_order_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('{admin}') then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, p.email, p.full_name, p.phone, p.is_blocked, p.created_at,
         count(o.id),
         count(o.id) filter (where o.status = 'delivered'),
         coalesce(sum(o.total - o.refunded_amount) filter (where o.status = 'delivered'), 0),
         max(o.created_at)
  from public.profiles p
  left join public.orders o on o.user_id = p.id
  where p.role = 'customer'
    and (p_search is null or p_search = ''
         or p.email ilike '%' || p_search || '%'
         or p.full_name ilike '%' || p_search || '%'
         or p.phone ilike '%' || p_search || '%')
  group by p.id
  order by max(o.created_at) desc nulls last, p.created_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

revoke execute on function public.admin_customers(text, int) from public, anon;
grant execute on function public.admin_customers(text, int) to authenticated;

-- 3. Counts per status for the admin order tabs
create or replace function public.admin_order_counts(p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v from (
    select o.status, count(*) n from public.orders o
    join public.delivery_slots s on s.id = o.slot_id
    where s.slot_date = p_date group by o.status) x;
  return v;
end $$;

revoke execute on function public.admin_order_counts(date) from public, anon;
grant execute on function public.admin_order_counts(date) to authenticated;
