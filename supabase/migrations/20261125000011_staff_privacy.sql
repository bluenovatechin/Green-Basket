-- Staff privacy: only ADMINS see money and customer accounts.
--
--  - Packers and riders can no longer read the orders table directly (it holds totals, prices and refunds).
--    They get the order data they need through the functions below, which leave out every money field.
--    The one exception: a rider sees "collect ₹X" on a cash-on-delivery order that is still unpaid,
--    because they must collect exactly that amount.
--  - Customer profiles (emails, phones) and the customer list are admin-only.
--  - The dashboard shows revenue and cash-collected totals to admins only.
-- Customers still read their own orders exactly as before.

-- ---------- 1. tighter read rules ----------
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (
  user_id = auth.uid() or public.has_role('{admin}')
);

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (
  id = auth.uid() or public.has_role('{admin}')
);

drop policy if exists stock_movements_staff on public.stock_movements;
create policy stock_movements_staff on public.stock_movements for select using (public.has_role('{admin,packer}'));

-- ---------- 2. packer / admin: orders without money ----------
create or replace function public.staff_orders(p_date date, p_statuses public.order_status[] default null, p_slot_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb) into v from (
    select o.id, o.order_number, o.status, o.payment_method, o.address, o.rider_id, o.slot_id, o.created_at,
           coalesce(nullif(rp.full_name, ''), 'Rider') as rider_name,
           jsonb_build_object('slot_date', s.slot_date, 'start_time', s.start_time, 'end_time', s.end_time) as delivery_slots,
           (select count(*) from public.order_items i where i.order_id = o.id and not i.is_unavailable) as item_count
    from public.orders o
    join public.delivery_slots s on s.id = o.slot_id
    left join public.profiles rp on rp.id = o.rider_id
    where s.slot_date = p_date
      and (p_statuses is null or cardinality(p_statuses) = 0 or o.status = any (p_statuses))
      and (p_slot_id is null or o.slot_id = p_slot_id)
  ) x;
  return v;
end $$;

create or replace function public.staff_order(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'payment_method', o.payment_method,
    'address', o.address, 'rider_id', o.rider_id, 'slot_id', o.slot_id, 'created_at', o.created_at,
    'customer_note', o.customer_note, 'cancel_reason', o.cancel_reason,
    'delivery_slots', jsonb_build_object('slot_date', s.slot_date, 'start_time', s.start_time, 'end_time', s.end_time),
    'order_items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'product_name', i.product_name, 'variant_label', i.variant_label,
                                          'unit', i.unit, 'pack_qty', i.pack_qty, 'quantity', i.quantity,
                                          'is_unavailable', i.is_unavailable) order by i.product_name)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'order_events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'from_status', e.from_status, 'to_status', e.to_status,
                                          'note', e.note, 'created_at', e.created_at) order by e.created_at)
      from public.order_events e where e.order_id = o.id), '[]'::jsonb)
  ) into v
  from public.orders o join public.delivery_slots s on s.id = o.slot_id
  where o.id = p_order_id;
  if v is null then raise exception 'ORDER_NOT_FOUND'; end if;
  return v;
end $$;

-- Riders that can be assigned: names only, no email or phone.
create or replace function public.staff_riders()
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, coalesce(nullif(p.full_name, ''), 'Rider ' || left(p.id::text, 4))
  from public.profiles p where p.role = 'rider' and not p.is_blocked
  order by 2;
end $$;

-- ---------- 3. rider: own deliveries, money only where they must collect it ----------
create or replace function public.rider_orders(p_scope text default 'active')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.has_role('{rider,admin}') then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(x order by x.slot_date, x.start_time, x.created_at), '[]'::jsonb) into v from (
    select o.id, o.order_number, o.status, o.payment_method, o.address, o.customer_note, o.created_at, o.delivered_at,
           o.cod_collected_via,
           (o.payment_status = 'paid') as is_paid,
           case when o.payment_method = 'cod' and o.payment_status <> 'paid' then o.total end as collect_amount,
           s.slot_date, s.start_time,
           jsonb_build_object('slot_date', s.slot_date, 'start_time', s.start_time, 'end_time', s.end_time) as delivery_slots,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', i.id, 'product_name', i.product_name, 'variant_label', i.variant_label,
                                                 'quantity', i.quantity) order by i.product_name)
             from public.order_items i where i.order_id = o.id and not i.is_unavailable), '[]'::jsonb) as order_items
    from public.orders o
    join public.delivery_slots s on s.id = o.slot_id
    where o.rider_id = auth.uid()
      and case
            when p_scope = 'done' then o.status = 'delivered' and o.delivered_at >= now() - interval '7 days'
            else o.status in ('placed', 'confirmed', 'packed', 'out_for_delivery') and s.slot_date >= v_today - 1
          end
  ) x;
  return v;
end $$;

-- ---------- 4. dashboard: money for admins only ----------
create or replace function public.dashboard_summary(p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'by_status', coalesce((
      select jsonb_object_agg(status, n) from (
        select o.status, count(*) n from public.orders o
        join public.delivery_slots s on s.id = o.slot_id
        where s.slot_date = p_date group by o.status) x), '{}'::jsonb),
    'low_stock', (select count(*) from public.products where is_active and stock_qty <= low_stock_threshold)
  ) into v;

  if public.has_role('{admin}') then
    v := v || jsonb_build_object(
      'delivered_revenue', coalesce((
        select sum(o.total - o.refunded_amount) from public.orders o
        join public.delivery_slots s on s.id = o.slot_id
        where s.slot_date = p_date and o.status = 'delivered'), 0),
      'cod_collected', coalesce((
        select jsonb_agg(jsonb_build_object('rider', coalesce(pr.full_name, pr.email), 'via', x.via, 'amount', x.amount))
        from (
          select o.rider_id, o.cod_collected_via via, sum(o.total) amount from public.orders o
          join public.delivery_slots s on s.id = o.slot_id
          where s.slot_date = p_date and o.status = 'delivered' and o.payment_method = 'cod'
          group by o.rider_id, o.cod_collected_via) x
        left join public.profiles pr on pr.id = x.rider_id), '[]'::jsonb),
      'open_refunds', (select count(*) from public.refunds where status in ('pending', 'processing', 'failed'))
    );
  end if;
  return v;
end $$;

-- ---------- 5. who may call what ----------
revoke execute on function public.staff_orders(date, public.order_status[], uuid) from public, anon;
revoke execute on function public.staff_order(uuid) from public, anon;
revoke execute on function public.staff_riders() from public, anon;
revoke execute on function public.rider_orders(text) from public, anon;
grant execute on function public.staff_orders(date, public.order_status[], uuid) to authenticated;
grant execute on function public.staff_order(uuid) to authenticated;
grant execute on function public.staff_riders() to authenticated;
grant execute on function public.rider_orders(text) to authenticated;
