-- Green Basket: who can read and write what.
-- Rule of thumb: the app may READ through the API under row-level security, but anything that
-- moves money, stock or slots is done only through the functions in 0002, never by direct writes.

-- ---------- start from zero ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter table public.profiles          enable row level security;
alter table public.service_pincodes  enable row level security;
alter table public.addresses         enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.product_variants  enable row level security;
alter table public.price_history     enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.slot_templates    enable row level security;
alter table public.delivery_slots    enable row level security;
alter table public.settings          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.order_events      enable row level security;
alter table public.payments          enable row level security;
alter table public.refunds           enable row level security;
alter table public.email_outbox      enable row level security;  -- no policies: service role only

grant execute on function public.has_role(public.user_role[]) to anon, authenticated;

-- ---------- catalogue: anyone can browse ----------
grant select on public.categories, public.products, public.product_variants,
                public.service_pincodes, public.delivery_slots, public.settings
  to anon, authenticated;

create policy categories_read on public.categories for select
  using (is_active or public.has_role('{admin,packer}'));
create policy products_read on public.products for select
  using (is_active or public.has_role('{admin,packer}'));
create policy variants_read on public.product_variants for select
  using (is_active or public.has_role('{admin,packer}'));
create policy pincodes_read on public.service_pincodes for select using (true);
create policy slots_read on public.delivery_slots for select
  using ((is_active and cutoff_at > now()) or public.has_role('{admin,packer,rider}'));
create policy settings_read on public.settings for select using (true);

-- ---------- catalogue: admin writes ----------
grant insert, update, delete on public.categories, public.product_variants,
                                public.service_pincodes, public.delivery_slots to authenticated;
grant select, insert, update, delete on public.slot_templates to authenticated;
grant usage on sequence public.categories_id_seq, public.slot_templates_id_seq to authenticated;

-- products: stock_qty is NOT writable here; it changes only via orders and admin_adjust_stock()
grant insert (category_id, name, name_local, description, image_url, unit, low_stock_threshold, is_active, sort_order)
  on public.products to authenticated;
grant update (category_id, name, name_local, description, image_url, unit, low_stock_threshold, is_active, sort_order)
  on public.products to authenticated;

grant update (store_name, support_email, support_phone, min_order_value, delivery_fee, free_delivery_above,
              cod_enabled, cod_max_amount, online_payment_enabled, payment_timeout_minutes, max_qty_per_item)
  on public.settings to authenticated;

create policy categories_admin on public.categories for all
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));
create policy products_admin_insert on public.products for insert with check (public.has_role('{admin}'));
create policy products_admin_update on public.products for update
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));
create policy variants_admin on public.product_variants for all
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));
create policy pincodes_admin on public.service_pincodes for all
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));
create policy slots_admin on public.delivery_slots for all
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));
create policy slot_templates_admin on public.slot_templates for all
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));
create policy settings_admin on public.settings for update
  using (public.has_role('{admin}')) with check (public.has_role('{admin}'));

-- ---------- people ----------
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;   -- not role, not is_blocked
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.has_role('{admin,packer}'));
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

grant select, insert, update, delete on public.addresses to authenticated;
create policy addresses_own on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- orders: read-only through the API ----------
grant select on public.orders, public.order_items, public.order_events, public.payments, public.refunds
  to authenticated;

create policy orders_read on public.orders for select using (
  user_id = auth.uid()
  or public.has_role('{admin,packer}')
  or (rider_id = auth.uid() and public.has_role('{rider}'))
);
create policy order_items_read on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_events_read on public.order_events for select
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy payments_read on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_role('{admin}'))));
create policy refunds_read on public.refunds for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_role('{admin}'))));

-- ---------- staff-only reads ----------
grant select on public.stock_movements, public.price_history to authenticated;
create policy stock_movements_staff on public.stock_movements for select using (public.has_role('{admin,packer}'));
create policy price_history_staff on public.price_history for select using (public.has_role('{admin}'));

-- ---------- functions the app may call ----------
grant execute on function
  public.place_order(uuid, uuid, public.payment_method, jsonb, text, text),
  public.cancel_order(uuid, text),
  public.set_order_status(uuid, public.order_status, text),
  public.assign_rider(uuid, uuid),
  public.complete_delivery(uuid, text),
  public.mark_item_unavailable(uuid),
  public.admin_adjust_stock(uuid, numeric, text, text),
  public.admin_set_role(text, public.user_role),
  public.admin_set_blocked(uuid, boolean),
  public.generate_slots(int),
  public.procurement_for_date(date),
  public.dashboard_summary(date)
to authenticated;

-- ---------- functions only the server (Edge Functions / scheduler) may call ----------
grant execute on function
  public.create_payment_attempt(uuid, uuid),
  public.confirm_online_payment(text, text, jsonb),
  public.fail_online_payment(text, jsonb),
  public.expire_stale_orders(),
  public.generate_slots(int),
  public.claim_email_batch(int),
  public.complete_email(bigint, boolean, text),
  public.claim_refunds(int)
to service_role;
