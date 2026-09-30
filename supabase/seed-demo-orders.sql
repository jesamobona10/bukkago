-- Second seed step: orders and payments, so the Overview dashboard has something to show.
--
-- Run this ONLY after signing up at least one real user in Supabase Auth and inserting
-- their UUID into public.customers. Both orders.customer_id and payments.order_id chain
-- back to auth.users, so this cannot be automated.
--
-- Replace the customer UUID below first:
--   select id, email from auth.users order by created_at;
--
--   psql "$SUPABASE_DB_URL" -v customer_id='<uuid>' -f supabase/seed-demo-orders.sql
--
-- The \set default makes the script fail loudly with a clear message if it was run
-- without -v customer_id=... rather than inserting a garbage UUID.

\if :{?customer_id}
\else
  \echo 'ERROR: pass -v customer_id=<uuid of a real auth.users row>'
  \quit
\endif

-- Pick up the customers row for that user, creating it if the signup flow never did.
insert into public.customers (id, name, phone)
values (:'customer_id', 'Demo Customer', '+234 800 555 0100')
on conflict (id) do nothing;

-- Orders are inserted with explicit ids so the status spread is deterministic across
-- re-runs, then the sequence is resynced so place_order() does not collide.
insert into public.orders (id, customer_id, vendor_id, pickup_slot_id, status, pickup_code, total_amount, payment_status, idempotency_key, accepted_at, ready_at, collected_at, cancelled_at, created_at)
select
  o.id,
  :'customer_id',
  v.id,
  s.id,
  o.status,
  o.pickup_code,
  o.total_amount,
  o.payment_status,
  'seed-' || o.id::text,
  case when o.status in ('accepted','preparing','ready','collected') then o.created_at + interval '3 minutes' end,
  case when o.status in ('ready','collected') then o.created_at + interval '18 minutes' end,
  case when o.status = 'collected' then o.created_at + interval '34 minutes' end,
  case when o.status in ('cancelled','no_show') then o.created_at + interval '40 minutes' end,
  o.created_at
from (values
  (9001, 'Mama Nkechi''s Kitchen', 'pending',   '482163', 7950, 'paid',     now() - interval '12 minutes'),
  (9002, 'Mama Nkechi''s Kitchen', 'preparing', '731904', 7700, 'paid',     now() - interval '26 minutes'),
  (9003, 'Tunde''s Chop House',    'ready',     '115028', 5500, 'paid',     now() - interval '41 minutes'),
  (9004, 'Tunde''s Chop House',    'collected', '640517', 5500, 'paid',     now() - interval '2 hours'),
  (9005, 'Aunty B''s Rice Pot',   'collected', '293846', 11600, 'paid',    now() - interval '3 hours'),
  (9006, 'Aunty B''s Rice Pot',   'no_show',   '507319', 7600, 'paid',     now() - interval '5 hours'),
  (9007, 'Sabi Chop Spot',        'cancelled', '861204', 3200, 'refunded', now() - interval '7 hours'),
  (9008, 'Sabi Chop Spot',        'collected', '174635', 5000, 'paid',     now() - interval '26 hours'),
  (9009, 'Mama Nkechi''s Kitchen', 'collected', '928401', 4500, 'unpaid',  now() - interval '30 hours')
) as o(id, vendor_name, status, pickup_code, total_amount, payment_status, created_at)
join public.vendors v on v.name = o.vendor_name
left join lateral (
  select ps.id
  from public.pickup_slots ps
  where ps.vendor_id = v.id
  order by ps.slot_date, ps.start_time
  limit 1
) s on true
where not exists (select 1 from public.orders existing where existing.id = o.id);

select setval(
  pg_get_serial_sequence('public.orders', 'id'),
  coalesce((select max(id) from public.orders), 1)
);

insert into public.order_items (order_id, name_snapshot, price_snapshot, quantity, subtotal)
select oi.order_id, oi.name_snapshot, oi.price_snapshot, oi.quantity, oi.subtotal
from (values
  (9001, 'Jollof rice + chicken', 3500, 1, 3500),
  (9001, 'Egusi soup + pounded yam', 4500, 1, 4500),
  (9002, 'Fried rice + prawns', 4200, 1, 4200),
  (9002, 'Jollof rice + chicken', 3500, 1, 3500),
  (9003, 'Chopped rice + egg', 3000, 1, 3000),
  (9003, 'Akara + bread + tea', 1800, 1, 1800),
  (9004, 'Chopped rice plate', 2500, 1, 2500),
  (9004, 'Chopped rice + egg', 3000, 1, 3000),
  (9005, 'Jollof + stew + chicken', 3800, 2, 7600),
  (9005, 'Egusi + eba', 4200, 1, 4200),
  (9006, 'Jollof + stew + chicken', 3800, 2, 7600),
  (9007, 'Chopped rice + fish', 3200, 1, 3200),
  (9008, 'Akara + bread + tea', 1800, 1, 1800),
  (9008, 'Chopped rice + fish', 3200, 1, 3200),
  (9009, 'Egusi soup + pounded yam', 4500, 1, 4500)
) as oi(order_id, name_snapshot, price_snapshot, quantity, subtotal)
where exists (select 1 from public.orders o where o.id = oi.order_id)
  and not exists (
    select 1 from public.order_items existing where existing.order_id = oi.order_id
  );

insert into public.payments (order_id, provider, provider_reference, amount, status, created_at)
select o.id, 'paystack', 'seed-pay-' || o.id::text, o.total_amount,
  case o.payment_status when 'paid' then 'success' when 'refunded' then 'refunded' when 'failed' then 'failed' else 'pending' end,
  o.created_at + interval '1 minute'
from public.orders o
where o.id between 9001 and 9009
  and not exists (select 1 from public.payments p where p.order_id = o.id);

-- One recent failure so the dashboard's webhook alert has something to show.
insert into public.payments (order_id, provider, provider_reference, amount, status, created_at)
select o.id, 'paystack', 'seed-pay-fail-' || o.id::text, o.total_amount, 'failed', now() - interval '90 minutes'
from public.orders o
where o.id = 9002
  and not exists (select 1 from public.payments p where p.provider_reference = 'seed-pay-fail-9002');

-- Two open disputes, and one already resolved, for the disputes counter.
insert into public.disputes (order_id, raised_by_type, dispute_type, description, status)
select o.id, o.raised_by, o.dispute_type, o.description, o.status
from (values
  (9006, 'customer', 'no_show',  'Ordered and prepaid, waited 25 minutes past my slot, then left.', 'open'),
  (9003, 'vendor',   'quality',  'Customer says the fish was undercooked. Photo attached in the app.', 'investigating'),
  (9007, 'system',   'payment',  'Order was refunded by the vendor but the webhook never confirmed it.', 'resolved')
) as o(order_id, raised_by, dispute_type, description, status)
join public.orders ord on ord.id = o.order_id
where not exists (select 1 from public.disputes d where d.order_id = o.order_id and d.description = o.description);
