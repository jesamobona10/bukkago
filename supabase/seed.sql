-- Baseline demo data for the Super Admin Panel.
--
-- Deliberately excludes admin_users, customers, orders and payments: all four have a
-- foreign key into auth.users, so they cannot be inserted without a real signed-up user.
-- See seed-demo-orders.sql for the second step, and README.md for the admin bootstrap.

insert into public.vendors (name, description, area, address, phone, status, avg_prep_time_minutes)
values
  ('Mama Nkechi''s Kitchen', 'Home-style Nigerian food, cooked to order. Rice, stews and fried extras.', 'Wuse 2', 'Plot 14, Wuse 2', '+234 803 555 0142', 'active', 20),
  ('Tunde''s Chop House', 'Quick chopped plates for lunch breaks around the junction.', 'Wuse 2', 'Shop 3, Zone 3', '+234 806 555 0177', 'active', 12),
  ('Aunty B''s Rice Pot', 'One-pot meals, generous portions, family recipes.', 'Jikwoyi', '22B, Jikwoyi Road', '+234 802 555 0119', 'active', 25),
  ('Sabi Chop Spot', 'Chopped rice and plantain, breakfast through late afternoon.', 'Wuse 2', 'Mile 4, Market Road', '+234 809 555 0163', 'active', 15),
  ('Golden Pot Kitchen', 'Stews, soups and swallow. Pre-order for the evening rush.', 'Maitama', '9, Zuma Street', '+234 811 555 0188', 'pending', 30),
  ('Aunty Kemi''s Place', 'Grilled fish, chicken and cold drinks.', 'Asokoro', '22, Asokoro Extension', '+234 813 555 0147', 'pending', 18),
  ('Ilekuku Snacks', 'Pastries, meat pies, chilled zobo.', 'Wuse 2', 'Kiosk 6, Zone 5', '+234 815 555 0125', 'suspended', 10)
on conflict do nothing;

-- Menus and slots are attached by name lookup so the seed is safe to re-run.
insert into public.menu_items (vendor_id, name, description, price, quantity_remaining, is_available)
select v.id, m.name, m.description, m.price, m.quantity, m.available
from public.vendors v
join (values
  ('Mama Nkechi''s Kitchen', 'Jollof rice + chicken', 'Smoked chicken thigh, one scoop of jollof, plantain.', 3500, 40, true),
  ('Mama Nkechi''s Kitchen', 'Fried rice + prawns', 'Large portion, prawns and garnish.', 4200, 25, true),
  ('Mama Nkechi''s Kitchen', 'Egusi soup + pounded yam', 'Two wraps, one scoop.', 4500, 18, true),
  ('Tunde''s Chop House', 'Chopped rice plate', 'Rice, chicken, cabbage, carrot, plantain.', 2500, 60, true),
  ('Tunde''s Chop House', 'Chopped rice + egg', 'Add a fried egg.', 3000, 35, true),
  ('Tunde''s Chop House', 'Beans and plantain', 'Bean porridge or stew, fried plantain.', 2000, 45, true),
  ('Aunty B''s Rice Pot', 'Jollof + stew + chicken', 'Full plate with fried plantain.', 3800, 30, true),
  ('Aunty B''s Rice Pot', 'Ofada rice + okporoko', 'One-pot style, very spicy.', 3600, 20, true),
  ('Aunty B''s Rice Pot', 'Egusi + eba', 'Palm nut egusi with a small eba ball.', 4200, 15, true),
  ('Sabi Chop Spot', 'Chopped rice + fish', 'Grilled tilapia, cabbage, plantain.', 3200, 25, true),
  ('Sabi Chop Spot', 'Akara + bread + tea', 'Breakfast set.', 1800, 50, true),
  ('Ilekuku Snacks', 'Meat pie', 'Pastry shell, minced beef and carrot.', 1200, 30, false),
  ('Ilekuku Snacks', 'Chilled zobo', 'Hibiscus, ginger, 30cl.', 800, 40, false)
) as m(vendor_name, name, description, price, quantity, available)
  on m.vendor_name = v.name
where not exists (
  select 1 from public.menu_items mi where mi.vendor_id = v.id and mi.name = m.name
);

insert into public.pickup_slots (vendor_id, slot_date, start_time, end_time, capacity, orders_count)
select v.id, current_date, s.start_time, s.end_time::time, s.capacity, 0
from public.vendors v
join (values
  ('Mama Nkechi''s Kitchen', '12:00'::time, '12:15'::time, 20),
  ('Mama Nkechi''s Kitchen', '12:15'::time, '12:30'::time, 20),
  ('Mama Nkechi''s Kitchen', '12:30'::time, '12:45'::time, 20),
  ('Mama Nkechi''s Kitchen', '12:45'::time, '13:00'::time, 20),
  ('Tunde''s Chop House', '12:00'::time, '12:15'::time, 25),
  ('Tunde''s Chop House', '12:15'::time, '12:30'::time, 25),
  ('Tunde''s Chop House', '12:30'::time, '12:45'::time, 25),
  ('Aunty B''s Rice Pot', '12:30'::time, '12:45'::time, 15),
  ('Aunty B''s Rice Pot', '12:45'::time, '13:00'::time, 15),
  ('Sabi Chop Spot', '12:00'::time, '12:15'::time, 18),
  ('Sabi Chop Spot', '12:15'::time, '12:30'::time, 18)
) as s(vendor_name, start_time, end_time, capacity)
  on s.vendor_name = v.name
where not exists (
  select 1 from public.pickup_slots ps
  where ps.vendor_id = v.id
    and ps.slot_date = current_date
    and ps.start_time = s.start_time
);
