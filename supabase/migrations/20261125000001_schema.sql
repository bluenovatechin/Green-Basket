-- Green Basket: core schema
-- All money is stored in rupees as numeric(10,2). Stock is stored in each product's base unit
-- (grams, ml, pieces, bunches or packs) so that several pack sizes share one stock pool.

-- ---------- enums ----------
create type public.user_role as enum ('customer', 'admin', 'packer', 'rider');
create type public.stock_unit as enum ('g', 'ml', 'piece', 'bunch', 'pack');
create type public.order_status as enum (
  'pending_payment',   -- online order created, stock + slot reserved, waiting for PhonePe
  'placed',            -- COD order created, or online payment succeeded
  'confirmed',         -- accepted by the store
  'packed',            -- packed and ready for a rider
  'out_for_delivery',
  'delivered',
  'cancelled',
  'payment_failed'     -- online payment failed or expired; reservations released
);
create type public.payment_method as enum ('cod', 'online');
create type public.payment_status as enum ('pending', 'paid', 'failed');

-- ---------- people ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  role        public.user_role not null default 'customer',
  is_blocked  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.service_pincodes (
  pincode    text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  area_name  text not null,
  is_active  boolean not null default true
);

create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  label       text not null default 'Home',
  full_name   text not null,
  phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
  line1       text not null,
  line2       text,
  landmark    text,
  city        text not null,
  pincode     text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  lat         double precision,
  lng         double precision,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

-- ---------- catalogue ----------
create table public.categories (
  id          serial primary key,
  name        text not null,
  slug        text not null unique,
  image_url   text,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  category_id         int references public.categories (id) on delete set null,
  name                text not null,
  name_local          text,                -- e.g. Gujarati name
  description         text,
  image_url           text,
  unit                public.stock_unit not null,
  stock_qty           numeric(12, 3) not null default 0 check (stock_qty >= 0),
  low_stock_threshold numeric(12, 3) not null default 0,
  is_active           boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  label       text not null,                         -- "500 g", "1 bunch"
  pack_qty    numeric(12, 3) not null check (pack_qty > 0),   -- in the product's base unit
  price       numeric(10, 2) not null check (price >= 0),
  mrp         numeric(10, 2) check (mrp is null or mrp >= price),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id);

create table public.price_history (
  id          bigserial primary key,
  variant_id  uuid not null references public.product_variants (id) on delete cascade,
  old_price   numeric(10, 2),
  new_price   numeric(10, 2) not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

create table public.stock_movements (
  id          bigserial primary key,
  product_id  uuid not null references public.products (id) on delete cascade,
  change      numeric(12, 3) not null,
  reason      text not null check (reason in ('restock', 'order_reserve', 'order_release', 'wastage', 'adjustment', 'unavailable')),
  order_id    uuid,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

-- ---------- delivery slots ----------
create table public.slot_templates (
  id              serial primary key,
  weekday         smallint not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time      time not null,
  end_time        time not null check (end_time > start_time),
  capacity        int not null check (capacity >= 0),
  cutoff_minutes  int not null default 120 check (cutoff_minutes >= 0),
  is_active       boolean not null default true,
  unique (weekday, start_time)
);

create table public.delivery_slots (
  id          uuid primary key default gen_random_uuid(),
  slot_date   date not null,
  start_time  time not null,
  end_time    time not null check (end_time > start_time),
  capacity    int not null check (capacity >= 0),
  booked      int not null default 0 check (booked >= 0),
  cutoff_at   timestamptz not null,
  is_active   boolean not null default true,
  unique (slot_date, start_time)
);

-- ---------- settings (single row) ----------
create table public.settings (
  id                       boolean primary key default true check (id),
  store_name               text not null default 'Green Basket',
  support_email            text,
  support_phone            text,
  min_order_value          numeric(10, 2) not null default 99,
  delivery_fee             numeric(10, 2) not null default 20,
  free_delivery_above      numeric(10, 2) not null default 299,
  cod_enabled              boolean not null default true,
  cod_max_amount           numeric(10, 2) not null default 1000,
  online_payment_enabled   boolean not null default true,
  payment_timeout_minutes  int not null default 15 check (payment_timeout_minutes between 5 and 60),
  max_qty_per_item         int not null default 20 check (max_qty_per_item > 0),
  updated_at               timestamptz not null default now()
);
insert into public.settings (id) values (true);

-- ---------- orders ----------
create sequence public.order_number_seq;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique,
  user_id             uuid not null references public.profiles (id),
  idempotency_key     text not null,
  address             jsonb not null,      -- snapshot, so later address edits don't change old orders
  pincode             text not null,
  slot_id             uuid not null references public.delivery_slots (id),
  status              public.order_status not null,
  payment_method      public.payment_method not null,
  payment_status      public.payment_status not null default 'pending',
  subtotal            numeric(10, 2) not null check (subtotal >= 0),
  delivery_fee        numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  discount            numeric(10, 2) not null default 0 check (discount >= 0),
  total               numeric(10, 2) not null check (total >= 0),
  refunded_amount     numeric(10, 2) not null default 0 check (refunded_amount >= 0),
  rider_id            uuid references public.profiles (id),
  cod_collected_via   text check (cod_collected_via in ('cash', 'upi_qr')),
  customer_note       text check (char_length(customer_note) <= 300),
  cancel_reason       text,
  payment_expires_at  timestamptz,
  placed_at           timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_slot_idx on public.orders (slot_id);
create index orders_status_idx on public.orders (status);
create index orders_rider_idx on public.orders (rider_id) where rider_id is not null;
create index orders_pending_payment_idx on public.orders (payment_expires_at) where status = 'pending_payment';

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_id      uuid not null references public.products (id),
  variant_id      uuid not null references public.product_variants (id),
  product_name    text not null,
  variant_label   text not null,
  unit            public.stock_unit not null,
  pack_qty        numeric(12, 3) not null,
  quantity        int not null check (quantity > 0),
  unit_price      numeric(10, 2) not null,
  line_total      numeric(10, 2) not null,
  is_unavailable  boolean not null default false
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id           bigserial primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  note         text,
  actor_id     uuid,
  created_at   timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------- payments & refunds ----------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id),
  provider           text not null default 'phonepe',
  merchant_order_id  text not null unique,     -- our id sent to PhonePe, one per attempt
  provider_order_id  text,
  amount             numeric(10, 2) not null check (amount > 0),
  status             text not null default 'created' check (status in ('created', 'success', 'failed')),
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create index payments_created_idx on public.payments (created_at) where status = 'created';

create table public.refunds (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id),
  payment_id          uuid not null references public.payments (id),
  merchant_refund_id  text not null unique,
  amount              numeric(10, 2) not null check (amount > 0),
  reason              text not null,
  status              text not null default 'pending' check (status in ('pending', 'processing', 'success', 'failed')),
  attempts            int not null default 0,
  raw                 jsonb,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index refunds_open_idx on public.refunds (status) where status in ('pending', 'processing');

-- ---------- outgoing email queue (outbox pattern) ----------
create table public.email_outbox (
  id          bigserial primary key,
  to_email    text not null,
  template    text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts    int not null default 0,
  last_error  text,
  send_after  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index email_outbox_ready_idx on public.email_outbox (send_after) where status = 'pending';
