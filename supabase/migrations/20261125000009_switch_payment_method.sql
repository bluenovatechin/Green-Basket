-- Let customers change their mind about how to pay.
--
--  Online -> Cash on delivery: switch_to_cod() turns an unpaid online order (pending_payment) into a normal COD
--    order straight away. If a PhonePe payment that was already in progress succeeds later, the order is
--    simply marked paid (rider collects nothing). Any further duplicate payment is refunded automatically.
--
--  Cash on delivery -> Online: a COD order that is not yet paid can be paid online at any time before delivery.
--    It stays a COD order until PhonePe confirms the money, so abandoning the payment page never cancels it.

create or replace function public.switch_to_cod(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_settings public.settings;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from auth.uid() then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending_payment' or v_order.payment_status = 'paid' then
    raise exception 'ORDER_NOT_AWAITING_PAYMENT';
  end if;

  select * into v_settings from public.settings where id;
  if not v_settings.cod_enabled then raise exception 'PAYMENT_METHOD_UNAVAILABLE' using detail = 'cod'; end if;
  if v_order.total > v_settings.cod_max_amount then
    raise exception 'COD_LIMIT_EXCEEDED' using detail = v_settings.cod_max_amount::text;
  end if;

  perform set_config('app.status_note', 'Customer switched to cash/UPI on delivery', true);
  update public.orders
  set payment_method = 'cod', payment_status = 'pending', status = 'placed',
      placed_at = now(), payment_expires_at = null
  where id = p_order_id;
end $$;

revoke execute on function public.switch_to_cod(uuid) from public, anon;
grant execute on function public.switch_to_cod(uuid) to authenticated;

-- Payment attempts: online orders waiting for payment, or unpaid COD orders that want to pay online now
create or replace function public.create_payment_attempt(p_order_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_n int;
  v_mid text;
  v_expires timestamptz;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> p_user_id then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status = 'pending_payment' then
    if v_order.payment_expires_at <= now() then raise exception 'PAYMENT_WINDOW_EXPIRED'; end if;
    v_expires := v_order.payment_expires_at;
  elsif v_order.payment_method = 'cod' and v_order.payment_status = 'pending'
        and v_order.status in ('placed', 'confirmed', 'packed', 'out_for_delivery') then
    v_expires := now() + interval '15 minutes';   -- the COD order itself never expires
  else
    raise exception 'ORDER_NOT_AWAITING_PAYMENT';
  end if;

  select count(*) into v_n from public.payments where order_id = p_order_id;
  if v_n >= 8 then raise exception 'TOO_MANY_PAYMENT_ATTEMPTS'; end if;

  v_mid := replace(v_order.order_number, '-', '') || 'P' || (v_n + 1);
  insert into public.payments (order_id, merchant_order_id, amount) values (p_order_id, v_mid, v_order.total);
  return jsonb_build_object('merchant_order_id', v_mid, 'amount', v_order.total,
    'expires_at', v_expires, 'order_number', v_order.order_number);
end $$;

-- Idempotent; safe to call from the webhook, the return page and the reconciler at the same time
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

  -- 1. normal online order waiting for its payment
  if v_order.status = 'pending_payment' and v_order.payment_status <> 'paid' and v_pay.amount = v_order.total then
    perform set_config('app.status_note', 'Payment received', true);
    update public.orders set status = 'placed', payment_status = 'paid', placed_at = now() where id = v_order.id;
    return 'order_placed';
  end if;

  -- 2. COD order the customer chose to prepay online (amount must still match the current total)
  if v_order.payment_method = 'cod' and v_order.payment_status = 'pending' and v_pay.amount = v_order.total
     and v_order.status in ('placed', 'confirmed', 'packed', 'out_for_delivery') then
    insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (v_order.id, v_order.status, v_order.status, 'Paid online instead of cash on delivery', null);
    update public.orders set payment_method = 'online', payment_status = 'paid' where id = v_order.id;
    return 'cod_prepaid';
  end if;

  -- 3. anything else (expired, cancelled, switched to COD, already paid, amount changed): give the money back
  insert into public.refunds (order_id, payment_id, merchant_refund_id, amount, reason)
  values (v_order.id, v_pay.id, 'R' || p_merchant_order_id, v_pay.amount, 'Late or duplicate payment');
  perform public._enqueue_email(v_order.user_id, 'refund_initiated',
    jsonb_build_object('order_id', v_order.id, 'amount', v_pay.amount, 'reason', 'Payment received after the order changed'));
  return 'refund_created';
end $$;
