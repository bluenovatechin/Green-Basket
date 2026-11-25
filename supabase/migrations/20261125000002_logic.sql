-- Green Basket: business logic
-- Every write that touches money, stock or slots goes through these functions, never through
-- direct table updates from the app. Each function runs in one transaction: if any step fails,
-- everything is rolled back, so stock and slots can never be left half-reserved.
--
-- Lock order (to avoid deadlocks), always: payment -> order -> delivery slot -> products (by id).
--
-- Errors are raised with a stable CODE as the message and human detail in DETAIL.
-- The web app maps codes to friendly text (apps/web/src/lib/errors.ts).

-- ============================================================================
-- helpers
-- ============================================================================
create or replace function public.has_role(p_roles public.user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = any (p_roles) and not is_blocked
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger variants_touch before update on public.product_variants for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();
create trigger refunds_touch before update on public.refunds for each row execute function public.touch_updated_at();

-- New sign-up -> profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Price history
create or replace function public.log_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into public.price_history (variant_id, old_price, new_price, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.price end, new.price, auth.uid());
  end if;
  return new;
end $$;

create trigger variants_price_history after insert or update of price on public.product_variants
for each row execute function public.log_price_change();

-- Addresses: only serviceable pincodes, and one default per user
create or replace function public.check_address()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.service_pincodes where pincode = new.pincode and is_active) then
    raise exception 'PINCODE_NOT_SERVICEABLE' using detail = new.pincode;
  end if;
  if new.is_default then
    update public.addresses set is_default = false
    where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end $$;

create trigger addresses_check before insert or update on public.addresses
for each row execute function public.check_address();

-- ============================================================================
-- order status: audit log + emails, in one place
-- ============================================================================
create or replace function public.on_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      nullif(current_setting('app.status_note', true), ''),
      auth.uid()
    );

    -- Customer emails. A "cancelled" email is not sent for orders that were never placed.
    if new.status in ('placed', 'out_for_delivery', 'delivered', 'cancelled')
       and not (new.status = 'cancelled' and tg_op = 'UPDATE' and old.status = 'pending_payment') then
      select email into v_email from public.profiles where id = new.user_id;
      if coalesce(v_email, '') <> '' then
        insert into public.email_outbox (to_email, template, payload)
        values (v_email, 'order_' || new.status::text, jsonb_build_object('order_id', new.id));
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger orders_status_change after insert or update of status on public.orders
for each row execute function public.on_order_status_change();

create or replace function public._enqueue_email(p_user_id uuid, p_template text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select email into v_email from public.profiles where id = p_user_id;
  if coalesce(v_email, '') <> '' then
    insert into public.email_outbox (to_email, template, payload) values (v_email, p_template, p_payload);
  end if;
end $$;

-- ============================================================================
-- cart helper
-- ============================================================================
create or replace function public._cart_lines(p_items jsonb)
returns table (
  variant_id uuid, product_id uuid, product_name text, variant_label text,
  unit public.stock_unit, pack_qty numeric, quantity int, unit_price numeric, is_available boolean
)
language sql stable set search_path = public as $$
  with req as (
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e
    group by 1
  )
  select v.id, p.id, p.name, v.label, p.unit, v.pack_qty, req.quantity, v.price, (v.is_active and p.is_active)
  from req
  join public.product_variants v on v.id = req.variant_id
  join public.products p on p.id = v.product_id;
$$;

-- ============================================================================
-- stock release (internal)
-- ============================================================================
create or replace function public._release_order_stock(p_order_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_slot_id uuid;
begin
  select slot_id into v_slot_id from public.orders where id = p_order_id;
  -- lock order: slot first, then products by id
  perform 1 from public.delivery_slots where id = v_slot_id for update;

  for r in
    select product_id, sum(pack_qty * quantity) as qty
    from public.order_items
    where order_id = p_order_id and not is_unavailable
    group by product_id
    order by product_id
  loop
    update public.products set stock_qty = stock_qty + r.qty where id = r.product_id;
    insert into public.stock_movements (product_id, change, reason, order_id, note, created_by)
    values (r.product_id, r.qty, 'order_release', p_order_id, p_note, auth.uid());
  end loop;

  update public.delivery_slots set booked = greatest(booked - 1, 0) where id = v_slot_id;
end $$;

-- ============================================================================
-- refunds (internal): records money we owe back; the payments worker sends it to PhonePe
-- ============================================================================
create or replace function public._create_refund(p_order_id uuid, p_amount numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_n int;
begin
  if p_amount <= 0 then return; end if;
  select * into v_order from public.orders where id = p_order_id;
  select * into v_payment from public.payments
  where order_id = p_order_id and status = 'success'
  order by created_at desc limit 1;
  if not found then return; end if;  -- nothing was paid online

  select count(*) into v_n from public.refunds where order_id = p_order_id;
  insert into public.refunds (order_id, payment_id, merchant_refund_id, amount, reason, created_by)
  values (
    p_order_id, v_payment.id,
    'R' || replace(v_order.order_number, '-', '') || 'N' || (v_n + 1),
    p_amount, p_reason, auth.uid()
  );
  update public.orders set refunded_amount = refunded_amount + p_amount where id = p_order_id;
  perform public._enqueue_email(v_order.user_id, 'refund_initiated',
    jsonb_build_object('order_id', p_order_id, 'amount', p_amount, 'reason', p_reason));
end $$;

-- ============================================================================
-- cancel (internal)
-- ============================================================================
create or replace function public._cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  perform public._release_order_stock(p_order_id, 'cancelled: ' || coalesce(p_reason, ''));
  perform set_config('app.status_note', coalesce(p_reason, 'Cancelled'), true);
  update public.orders set status = 'cancelled', cancel_reason = p_reason where id = p_order_id;
  if v_order.payment_method = 'online' and v_order.payment_status = 'paid' then
    perform public._create_refund(p_order_id, v_order.total - v_order.refunded_amount, 'Order cancelled');
  end if;
end $$;

-- ============================================================================
-- PLACE ORDER
-- p_items: [{"variant_id": "...", "quantity": 2}, ...]
-- p_idempotency_key: generated once per checkout screen; repeated calls return the same order
-- ============================================================================
create or replace function public.place_order(
  p_address_id uuid,
  p_slot_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_idempotency_key text,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_settings public.settings;
  v_addr public.addresses;
  v_slot public.delivery_slots;
  v_existing public.orders;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_requested int;
  v_found int;
  v_unavailable text;
  v_too_many text;
  v_subtotal numeric(10, 2);
  v_fee numeric(10, 2);
  v_total numeric(10, 2);
  r record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'INVALID_REQUEST' using detail = 'idempotency key';
  end if;

  -- One checkout at a time per customer (makes the idempotency check race-free)
  perform pg_advisory_xact_lock(hashtext('place_order:' || v_uid::text));

  select * into v_existing from public.orders where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number,
      'status', v_existing.status, 'total', v_existing.total, 'payment_method', v_existing.payment_method,
      'duplicate', true);
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_profile.is_blocked then raise exception 'ACCOUNT_BLOCKED'; end if;

  select * into v_settings from public.settings where id;
  if p_payment_method = 'online' and not v_settings.online_payment_enabled then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using detail = 'online';
  end if;
  if p_payment_method = 'cod' and not v_settings.cod_enabled then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using detail = 'cod';
  end if;

  -- address
  select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
  if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;
  if not exists (select 1 from public.service_pincodes where pincode = v_addr.pincode and is_active) then
    raise exception 'PINCODE_NOT_SERVICEABLE' using detail = v_addr.pincode;
  end if;

  -- cart
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'CART_EMPTY';
  end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'INVALID_REQUEST' using detail = 'too many lines'; end if;

  select count(distinct (e ->> 'variant_id')) into v_requested from jsonb_array_elements(p_items) e;
  select count(*),
         string_agg(product_name || ' ' || variant_label, ', ') filter (where not is_available),
         string_agg(product_name, ', ') filter (where quantity is null or quantity < 1 or quantity > v_settings.max_qty_per_item),
         sum(unit_price * quantity)
    into v_found, v_unavailable, v_too_many, v_subtotal
  from public._cart_lines(p_items);

  if v_found <> v_requested then raise exception 'ITEM_UNAVAILABLE' using detail = 'unknown item'; end if;
  if v_unavailable is not null then raise exception 'ITEM_UNAVAILABLE' using detail = v_unavailable; end if;
  if v_too_many is not null then raise exception 'INVALID_QUANTITY' using detail = v_too_many; end if;

  if v_subtotal < v_settings.min_order_value then
    raise exception 'BELOW_MINIMUM_ORDER' using detail = v_settings.min_order_value::text;
  end if;
  v_fee := case when v_subtotal >= v_settings.free_delivery_above then 0 else v_settings.delivery_fee end;
  v_total := v_subtotal + v_fee;
  if p_payment_method = 'cod' and v_total > v_settings.cod_max_amount then
    raise exception 'COD_LIMIT_EXCEEDED' using detail = v_settings.cod_max_amount::text;
  end if;

  -- slot (locked, so two customers can't take the last place)
  select * into v_slot from public.delivery_slots where id = p_slot_id for update;
  if not found or not v_slot.is_active then raise exception 'SLOT_UNAVAILABLE'; end if;
  if v_slot.cutoff_at <= now() then raise exception 'SLOT_CLOSED'; end if;
  if v_slot.booked >= v_slot.capacity then raise exception 'SLOT_FULL'; end if;

  -- reserve stock atomically, products in id order
  for r in
    select l.product_id, max(l.product_name) as name, sum(l.pack_qty * l.quantity) as need
    from public._cart_lines(p_items) l
    group by l.product_id
    order by l.product_id
  loop
    update public.products set stock_qty = stock_qty - r.need
    where id = r.product_id and stock_qty >= r.need;
    if not found then raise exception 'OUT_OF_STOCK' using detail = r.name; end if;
    insert into public.stock_movements (product_id, change, reason, order_id, created_by)
    values (r.product_id, -r.need, 'order_reserve', v_order_id, v_uid);
  end loop;

  update public.delivery_slots set booked = booked + 1 where id = p_slot_id;

  v_order_number := 'GB' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-'
                    || lpad(nextval('public.order_number_seq')::text, 5, '0');

  perform set_config('app.status_note',
    case when p_payment_method = 'cod' then 'Order placed (cash/UPI on delivery)' else 'Waiting for online payment' end, true);

  insert into public.orders (
    id, order_number, user_id, idempotency_key, address, pincode, slot_id, status,
    payment_method, payment_status, subtotal, delivery_fee, total, customer_note,
    payment_expires_at, placed_at
  ) values (
    v_order_id, v_order_number, v_uid, p_idempotency_key,
    jsonb_build_object('label', v_addr.label, 'full_name', v_addr.full_name, 'phone', v_addr.phone,
      'line1', v_addr.line1, 'line2', v_addr.line2, 'landmark', v_addr.landmark,
      'city', v_addr.city, 'pincode', v_addr.pincode, 'lat', v_addr.lat, 'lng', v_addr.lng),
    v_addr.pincode, p_slot_id,
    case when p_payment_method = 'cod' then 'placed' else 'pending_payment' end::public.order_status,
    p_payment_method, 'pending', v_subtotal, v_fee, v_total, nullif(trim(p_note), ''),
    case when p_payment_method = 'online' then now() + make_interval(mins => v_settings.payment_timeout_minutes) end,
    case when p_payment_method = 'cod' then now() end
  );

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_label, unit,
                                  pack_qty, quantity, unit_price, line_total)
  select v_order_id, l.product_id, l.variant_id, l.product_name, l.variant_label, l.unit,
         l.pack_qty, l.quantity, l.unit_price, l.unit_price * l.quantity
  from public._cart_lines(p_items) l;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
    'status', case when p_payment_method = 'cod' then 'placed' else 'pending_payment' end,
    'total', v_total, 'payment_method', p_payment_method, 'duplicate', false);
end $$;

-- ============================================================================
-- CUSTOMER / ADMIN CANCEL
-- ============================================================================
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_is_admin boolean := public.has_role('{admin}');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or (not v_is_admin and v_order.user_id is distinct from auth.uid()) then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_is_admin then
    if v_order.status not in ('pending_payment', 'placed', 'confirmed', 'packed', 'out_for_delivery') then
      raise exception 'CANNOT_CANCEL' using detail = v_order.status::text;
    end if;
  elsif v_order.status not in ('pending_payment', 'placed', 'confirmed') then
    raise exception 'CANNOT_CANCEL' using detail = v_order.status::text;
  end if;

  perform public._cancel_order(p_order_id,
    coalesce(nullif(trim(p_reason), ''), case when v_is_admin then 'Cancelled by store' else 'Cancelled by customer' end));
end $$;

-- ============================================================================
-- STAFF: status changes
-- ============================================================================
create or replace function public._transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('placed'::public.order_status, 'confirmed'::public.order_status),
    ('placed', 'packed'),
    ('confirmed', 'packed'),
    ('packed', 'out_for_delivery'),
    ('out_for_delivery', 'packed')   -- delivery attempt failed, back at the store
  );
$$;

create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = auth.uid() and not is_blocked;
  if v_role is null or v_role = 'customer' then raise exception 'FORBIDDEN'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_role = 'rider' and (v_order.rider_id is distinct from auth.uid() or p_status <> 'out_for_delivery') then
    raise exception 'FORBIDDEN';
  end if;
  if v_role = 'packer' and p_status not in ('confirmed', 'packed') then raise exception 'FORBIDDEN'; end if;

  if not public._transition_allowed(v_order.status, p_status) then
    raise exception 'INVALID_TRANSITION' using detail = v_order.status::text || ' -> ' || p_status::text;
  end if;
  if p_status = 'out_for_delivery' and v_order.rider_id is null then
    raise exception 'RIDER_NOT_ASSIGNED';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.orders set status = p_status where id = p_order_id;
end $$;

create or replace function public.assign_rider(p_order_id uuid, p_rider_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  if p_rider_id is not null and not exists (
    select 1 from public.profiles where id = p_rider_id and role = 'rider' and not is_blocked
  ) then
    raise exception 'INVALID_RIDER';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('placed', 'confirmed', 'packed') then
    raise exception 'INVALID_TRANSITION' using detail = 'cannot assign rider when ' || v_order.status::text;
  end if;
  update public.orders set rider_id = p_rider_id where id = p_order_id;
end $$;

create or replace function public.complete_delivery(p_order_id uuid, p_collected_via text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if not public.has_role('{admin,rider}') then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if public.has_role('{rider}') and v_order.rider_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_order.status <> 'out_for_delivery' then
    raise exception 'INVALID_TRANSITION' using detail = v_order.status::text || ' -> delivered';
  end if;

  if v_order.payment_method = 'cod' then
    if p_collected_via is null or p_collected_via not in ('cash', 'upi_qr') then
      raise exception 'COLLECTION_METHOD_REQUIRED';
    end if;
  end if;

  perform set_config('app.status_note',
    case when v_order.payment_method = 'cod' then 'Delivered, collected by ' || p_collected_via else 'Delivered' end, true);
  update public.orders
  set status = 'delivered',
      delivered_at = now(),
      payment_status = case when payment_method = 'cod' then 'paid'::public.payment_status else payment_status end,
      cod_collected_via = case when payment_method = 'cod' then p_collected_via end
  where id = p_order_id;
end $$;

-- Item missing at packing time: remove it from the bill, refund if prepaid
create or replace function public.mark_item_unavailable(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item public.order_items;
  v_order public.orders;
  v_new_subtotal numeric(10, 2);
  v_new_total numeric(10, 2);
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  select * into v_item from public.order_items where id = p_item_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  if v_order.status not in ('placed', 'confirmed') then
    raise exception 'INVALID_TRANSITION' using detail = 'items can only be changed before packing';
  end if;
  if v_item.is_unavailable then return; end if;

  update public.order_items set is_unavailable = true where id = p_item_id;
  -- The reserved stock did not physically exist, so it is not returned. Log it for the stock report.
  insert into public.stock_movements (product_id, change, reason, order_id, note, created_by)
  values (v_item.product_id, 0, 'unavailable', v_order.id,
          v_item.product_name || ' ' || v_item.variant_label || ' x' || v_item.quantity, auth.uid());

  select coalesce(sum(line_total), 0) into v_new_subtotal
  from public.order_items where order_id = v_order.id and not is_unavailable;

  if v_new_subtotal = 0 then
    perform public._cancel_order(v_order.id, 'All items unavailable');
    return;
  end if;

  v_new_total := v_new_subtotal + v_order.delivery_fee - v_order.discount;
  update public.orders set subtotal = v_new_subtotal, total = v_new_total where id = v_order.id;

  if v_order.payment_method = 'online' and v_order.payment_status = 'paid' then
    perform public._create_refund(v_order.id, v_order.total - v_new_total,
      v_item.product_name || ' ' || v_item.variant_label || ' unavailable');
  else
    perform public._enqueue_email(v_order.user_id, 'item_unavailable',
      jsonb_build_object('order_id', v_order.id, 'item', v_item.product_name || ' ' || v_item.variant_label,
                         'new_total', v_new_total));
  end if;
end $$;

-- ============================================================================
-- STAFF: stock, roles, slots, reports
-- ============================================================================
create or replace function public.admin_adjust_stock(p_product_id uuid, p_change numeric, p_reason text, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_new numeric;
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  if p_reason not in ('restock', 'wastage', 'adjustment') then raise exception 'INVALID_REQUEST' using detail = 'reason'; end if;
  if p_change = 0 then raise exception 'INVALID_REQUEST' using detail = 'change is zero'; end if;
  if p_reason = 'restock' and p_change < 0 then raise exception 'INVALID_REQUEST' using detail = 'restock must be positive'; end if;
  if p_reason = 'wastage' and p_change > 0 then raise exception 'INVALID_REQUEST' using detail = 'wastage must be negative'; end if;

  update public.products set stock_qty = stock_qty + p_change
  where id = p_product_id and stock_qty + p_change >= 0
  returning stock_qty into v_new;
  if not found then raise exception 'STOCK_NEGATIVE'; end if;

  insert into public.stock_movements (product_id, change, reason, note, created_by)
  values (p_product_id, p_change, p_reason, p_note, auth.uid());
  return v_new;
end $$;

create or replace function public.admin_set_role(p_email text, p_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.has_role('{admin}') then raise exception 'FORBIDDEN'; end if;
  select id into v_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'USER_NOT_FOUND' using detail = 'They must log in once first'; end if;
  if v_id = auth.uid() and p_role <> 'admin' then raise exception 'CANNOT_DEMOTE_SELF'; end if;
  update public.profiles set role = p_role where id = v_id;
end $$;

create or replace function public.admin_set_blocked(p_user_id uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('{admin}') then raise exception 'FORBIDDEN'; end if;
  if p_user_id = auth.uid() then raise exception 'CANNOT_DEMOTE_SELF'; end if;
  update public.profiles set is_blocked = p_blocked where id = p_user_id;
end $$;

create or replace function public.generate_slots(p_days int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_count int;
begin
  -- callable by admins from the app, and by the scheduler (no user)
  if auth.uid() is not null and not public.has_role('{admin}') then raise exception 'FORBIDDEN'; end if;
  insert into public.delivery_slots (slot_date, start_time, end_time, capacity, cutoff_at)
  select d::date, t.start_time, t.end_time, t.capacity,
         ((d::date + t.start_time) at time zone 'Asia/Kolkata') - make_interval(mins => t.cutoff_minutes)
  from generate_series(v_today, v_today + (greatest(p_days, 1) - 1), interval '1 day') d
  join public.slot_templates t on t.weekday = extract(dow from d)::int and t.is_active
  on conflict (slot_date, start_time) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- What to buy / pack for a delivery date
create or replace function public.procurement_for_date(p_date date)
returns table (product_id uuid, product_name text, name_local text, unit public.stock_unit,
               total_qty numeric, order_count bigint, stock_left numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('{admin,packer}') then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, p.name, p.name_local, p.unit,
         sum(oi.pack_qty * oi.quantity), count(distinct o.id), p.stock_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.delivery_slots s on s.id = o.slot_id
  join public.products p on p.id = oi.product_id
  where s.slot_date = p_date
    and o.status in ('placed', 'confirmed', 'packed')
    and not oi.is_unavailable
  group by p.id
  order by p.name;
end $$;

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
    'low_stock', (select count(*) from public.products where is_active and stock_qty <= low_stock_threshold),
    'open_refunds', (select count(*) from public.refunds where status in ('pending', 'processing', 'failed'))
  ) into v;
  return v;
end $$;

-- ============================================================================
-- PAYMENTS (called only by Edge Functions with the service role)
-- ============================================================================
create or replace function public.create_payment_attempt(p_order_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_n int;
  v_mid text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> p_user_id then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending_payment' then raise exception 'ORDER_NOT_AWAITING_PAYMENT'; end if;
  if v_order.payment_expires_at <= now() then raise exception 'PAYMENT_WINDOW_EXPIRED'; end if;
  select count(*) into v_n from public.payments where order_id = p_order_id;
  if v_n >= 5 then raise exception 'TOO_MANY_PAYMENT_ATTEMPTS'; end if;

  v_mid := replace(v_order.order_number, '-', '') || 'P' || (v_n + 1);
  insert into public.payments (order_id, merchant_order_id, amount) values (p_order_id, v_mid, v_order.total);
  return jsonb_build_object('merchant_order_id', v_mid, 'amount', v_order.total,
    'expires_at', v_order.payment_expires_at, 'order_number', v_order.order_number);
end $$;

-- Idempotent: safe to call from the webhook, the return page and the reconciler at the same time
create or replace function public.confirm_online_payment(p_merchant_order_id text, p_provider_order_id text, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payments;
  v_order public.orders;
begin
  select * into v_pay from public.payments where merchant_order_id = p_merchant_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_pay.status = 'success' then return 'already_confirmed'; end if;

  update public.payments
  set status = 'success', provider_order_id = coalesce(p_provider_order_id, provider_order_id), raw = p_raw
  where id = v_pay.id;

  select * into v_order from public.orders where id = v_pay.order_id for update;
  if v_order.status = 'pending_payment' and v_order.payment_status <> 'paid' then
    perform set_config('app.status_note', 'Payment received', true);
    update public.orders set status = 'placed', payment_status = 'paid', placed_at = now() where id = v_order.id;
    return 'order_placed';
  end if;

  -- Money arrived for an order that is no longer waiting (expired, cancelled, or paid twice): give it back.
  insert into public.refunds (order_id, payment_id, merchant_refund_id, amount, reason)
  values (v_order.id, v_pay.id, 'R' || p_merchant_order_id, v_pay.amount, 'Late or duplicate payment');
  perform public._enqueue_email(v_order.user_id, 'refund_initiated',
    jsonb_build_object('order_id', v_order.id, 'amount', v_pay.amount, 'reason', 'Payment received after the order had closed'));
  return 'refund_created';
end $$;

create or replace function public.fail_online_payment(p_merchant_order_id text, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  -- The order stays pending_payment so the customer can retry until it expires.
  update public.payments set status = 'failed', raw = p_raw
  where merchant_order_id = p_merchant_order_id and status = 'created';
  return case when found then 'payment_failed' else 'ignored' end;
end $$;

-- Releases stock and slots held by online orders that were never paid
create or replace function public.expire_stale_orders()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select o.id from public.orders o
    where o.status = 'pending_payment'
      and o.payment_expires_at < now()
      and (
        -- no payment in flight, or PhonePe has been silent for 20 extra minutes
        not exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'created')
        or o.payment_expires_at < now() - interval '20 minutes'
      )
    order by o.payment_expires_at
    limit 200
    for update skip locked
  loop
    perform public._release_order_stock(r.id, 'payment not completed');
    perform set_config('app.status_note', 'Payment not completed in time', true);
    update public.orders set status = 'payment_failed', payment_status = 'failed' where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ============================================================================
-- WORKER QUEUES (service role)
-- ============================================================================
create or replace function public.claim_email_batch(p_limit int default 20)
returns setof public.email_outbox language plpgsql security definer set search_path = public as $$
begin
  -- recover emails stuck in 'sending' (worker crashed)
  update public.email_outbox set status = 'pending'
  where status = 'sending' and send_after < now() - interval '10 minutes';

  return query
  update public.email_outbox e
  set status = 'sending', attempts = e.attempts + 1, send_after = now()
  where e.id in (
    select id from public.email_outbox
    where status = 'pending' and send_after <= now()
    order by id
    limit p_limit
    for update skip locked
  )
  returning e.*;
end $$;

create or replace function public.complete_email(p_id bigint, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update public.email_outbox set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  else
    update public.email_outbox
    set status = case when attempts >= 5 then 'failed' else 'pending' end,
        last_error = left(p_error, 500),
        send_after = now() + make_interval(mins => attempts * attempts)
    where id = p_id;
  end if;
end $$;

create or replace function public.claim_refunds(p_limit int default 10)
returns table (id uuid, merchant_refund_id text, amount numeric, status text, attempts int,
               merchant_order_id text, order_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.refunds r
  set updated_at = now(), attempts = case when r.status = 'pending' then r.attempts + 1 else r.attempts end
  from public.payments p
  where p.id = r.payment_id
    and r.id in (
      select x.id from public.refunds x
      where (x.status = 'pending' and x.attempts < 5)
         or (x.status = 'processing' and x.updated_at < now() - interval '2 minutes')
      order by x.created_at
      limit p_limit
      for update skip locked
    )
  returning r.id, r.merchant_refund_id, r.amount, r.status, r.attempts, p.merchant_order_id, r.order_id;
end $$;
