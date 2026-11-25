-- Sample data for development. Do NOT run on production except the settings/pincodes you need.

insert into public.service_pincodes (pincode, area_name) values
  ('388001', 'Anand City'),
  ('388120', 'Vallabh Vidyanagar'),
  ('388121', 'Karamsad')
on conflict do nothing;

update public.settings set
  support_email = 'support@greenbasket.in',
  min_order_value = 99, delivery_fee = 20, free_delivery_above = 299,
  cod_max_amount = 1000
where id;

insert into public.categories (name, slug, sort_order) values
  ('Fresh Vegetables', 'vegetables', 1),
  ('Leafy & Herbs', 'leafy-herbs', 2),
  ('Fresh Fruits', 'fruits', 3)
on conflict (slug) do nothing;

-- Products with pack sizes. Stock is in grams / pieces / bunches.
with p as (
  insert into public.products (category_id, name, name_local, unit, stock_qty, low_stock_threshold, sort_order) values
    ((select id from public.categories where slug = 'vegetables'),  'Tomato',        'ટામેટા',   'g',     50000, 5000, 1),
    ((select id from public.categories where slug = 'vegetables'),  'Onion',         'ડુંગળી',   'g',     80000, 8000, 2),
    ((select id from public.categories where slug = 'vegetables'),  'Potato',        'બટાકા',    'g',     80000, 8000, 3),
    ((select id from public.categories where slug = 'vegetables'),  'Bottle Gourd',  'દૂધી',     'piece', 60,    10,   4),
    ((select id from public.categories where slug = 'leafy-herbs'), 'Coriander',     'કોથમીર',   'bunch', 100,   20,   1),
    ((select id from public.categories where slug = 'leafy-herbs'), 'Spinach',       'પાલક',     'bunch', 60,    10,   2),
    ((select id from public.categories where slug = 'fruits'),      'Banana',        'કેળા',     'piece', 600,   60,   1),
    ((select id from public.categories where slug = 'fruits'),      'Apple (Shimla)', 'સફરજન',   'g',     30000, 3000, 2)
  returning id, name
)
insert into public.product_variants (product_id, label, pack_qty, price, mrp, sort_order)
select p.id, v.label, v.pack_qty, v.price, v.mrp, v.sort_order
from p
join (values
  ('Tomato', '500 g', 500, 20, 25, 1), ('Tomato', '1 kg', 1000, 38, 50, 2),
  ('Onion', '1 kg', 1000, 35, 45, 1), ('Onion', '2 kg', 2000, 68, 90, 2),
  ('Potato', '1 kg', 1000, 30, 40, 1), ('Potato', '2 kg', 2000, 58, 80, 2),
  ('Bottle Gourd', '1 piece', 1, 25, 30, 1),
  ('Coriander', '1 bunch', 1, 10, 15, 1),
  ('Spinach', '1 bunch', 1, 15, 20, 1),
  ('Banana', '6 pieces', 6, 30, 36, 1), ('Banana', '12 pieces', 12, 58, 72, 2),
  ('Apple (Shimla)', '500 g', 500, 80, 100, 1), ('Apple (Shimla)', '1 kg', 1000, 155, 200, 2)
) as v(name, label, pack_qty, price, mrp, sort_order) on v.name = p.name;

-- Two slots a day, every day: morning and evening
insert into public.slot_templates (weekday, start_time, end_time, capacity, cutoff_minutes)
select d, s.start_time, s.end_time, s.capacity, s.cutoff
from generate_series(0, 6) d
cross join (values ('07:00'::time, '09:00'::time, 40, 600),   -- order by 9 pm the night before
                   ('17:00'::time, '19:00'::time, 40, 180))   -- order by 2 pm the same day
  as s(start_time, end_time, capacity, cutoff)
on conflict do nothing;

select public.generate_slots(7);
