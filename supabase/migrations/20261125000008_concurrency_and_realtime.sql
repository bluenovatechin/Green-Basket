-- High-concurrency scaling & Supabase Realtime enhancements
-- 1. Enable REPLICA IDENTITY FULL on orders for reliable row-level Supabase Realtime streaming
alter table public.orders replica identity full;

-- 2. Optimize place_order: atomic slot reservation eliminates slot-level row lock serialization
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

  -- cart validation
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

  -- reserve stock atomically, products in id order to prevent deadlocks across concurrent carts
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

  -- atomic slot booking: increment booked spot and check capacity and cutoff without long row locks
  update public.delivery_slots
  set booked = booked + 1
  where id = p_slot_id and booked < capacity and cutoff_at > now() and is_active
  returning * into v_slot;
  if not found then
    select * into v_slot from public.delivery_slots where id = p_slot_id;
    if not found or not v_slot.is_active then raise exception 'SLOT_UNAVAILABLE';
    elsif v_slot.cutoff_at <= now() then raise exception 'SLOT_CLOSED';
    elsif v_slot.booked >= v_slot.capacity then raise exception 'SLOT_FULL';
    else raise exception 'SLOT_UNAVAILABLE';
    end if;
  end if;

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

revoke execute on function public.place_order(uuid, uuid, public.payment_method, jsonb, text, text) from public, anon;
grant execute on function public.place_order(uuid, uuid, public.payment_method, jsonb, text, text) to authenticated;
