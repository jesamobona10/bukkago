-- BukkaGo — admin oversight: column grants, suspension semantics, audited actions
--
-- Implements Phases 2, 3 and 5 of DOCS/10-SUPER-ADMIN-IMPLEMENTATION-GUIDE.md, and closes
-- the gaps left by 202609290002_super_admin_panel.sql. Migrations 001 and 002 are already
-- applied to the live project, so nothing here edits them; this is additive.
--
-- Decisions recorded in DOCS/11-SUPER-ADMIN-DECISIONS.md:
--   ADR-004  every sensitive action is a SECURITY DEFINER function called with the acting
--            admin's own session, doing the write and its audit row in one transaction.
--   ADR-007  suspension blocks new work and lets in-flight orders run to completion.

-- ============================================================
-- 1. COLUMN-LEVEL GRANTS — CLOSING THE SELF-APPROVAL HOLE
-- ============================================================
--
-- Migration 002 rebuilt vendors_manage as a table-level FOR UPDATE policy keyed on
-- ownership. RLS policies decide which ROWS a role may touch; they cannot decide which
-- COLUMNS. Supabase grants UPDATE on public tables to authenticated by default, so any
-- vendor owner could run
--
--   update public.vendors set status = 'active' where id = <their own vendor>
--
-- and approve themselves, bypassing admin_approve_vendor and its audit row entirely. That
-- is the whole action Phase 1 exists to police. The same shape of bug was closed for
-- customers.banned_at in 002; this is the vendors.status instance of it.
--
-- Postgres can restrict columns, but only through privileges. So: drop the blanket grant
-- and re-grant exactly the columns a vendor owner legitimately owns. status, suspended_*,
-- suspended_by and commission_rate become reachable only through the audited functions.

revoke update on public.vendors from authenticated;
grant update (name, description, logo_url, area, address, phone, avg_prep_time_minutes)
  on public.vendors to authenticated;

-- vendors_admin_insert let any admin create a vendor row with no audit entry. Vendors are
-- now provisioned through admin_provision_vendor below, which records the action and
-- always creates the row as 'pending' so approval still goes through the audited path.
revoke insert on public.vendors from authenticated;
drop policy if exists vendors_admin_insert on public.vendors;

-- pickup_slots.orders_count is a system-maintained counter: place_order increments it under
-- a row lock, and cancel/reject decrement it. slots_vendor_manage is FOR ALL, so a vendor
-- could have set orders_count = 0 and minted pickup capacity that no order ever booked.
revoke update on public.pickup_slots from authenticated;
grant update (slot_date, start_time, end_time, capacity)
  on public.pickup_slots to authenticated;

-- ============================================================
-- 2. SUSPENSION SEMANTICS
-- ============================================================
--
-- ADR-007: suspension blocks new work, but orders already accepted must still reach Ready
-- and Collected, or customers who paid are stranded.
--
-- So "operational" means pending or active. A pending vendor may still prepare their menu
-- — they are invisible to customers anyway, and an approved vendor whose account was
-- provisioned ahead of time should be able to load items before launch. Only suspended and
-- rejected vendors are locked out of their own content.

create or replace function public.vendor_is_operational(p_vendor bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vendors
    where id = p_vendor and status in ('pending', 'active')
  )
$$;

-- Only the two policies below call this, and both are `to authenticated`, so anon has no
-- business executing it directly. (is_admin() and owns_vendor() are left executable by
-- PUBLIC because policies that apply to anon depend on them.)
revoke all on function public.vendor_is_operational(bigint) from public, anon;
grant execute on function public.vendor_is_operational(bigint) to authenticated;

-- Menu and slot writes now require an operational vendor. 002 had already removed the
-- admin clause from menu_vendor_manage; this adds the status condition to both, and drops
-- the leftover `or public.is_admin()` that 002 left on slots_vendor_manage.

drop policy if exists menu_vendor_manage on public.menu_items;
create policy menu_vendor_manage on public.menu_items
  for all to authenticated
  using (public.owns_vendor(vendor_id) and public.vendor_is_operational(vendor_id))
  with check (public.owns_vendor(vendor_id) and public.vendor_is_operational(vendor_id));

drop policy if exists slots_vendor_manage on public.pickup_slots;
create policy slots_vendor_manage on public.pickup_slots
  for all to authenticated
  using (public.owns_vendor(vendor_id) and public.vendor_is_operational(vendor_id))
  with check (public.owns_vendor(vendor_id) and public.vendor_is_operational(vendor_id));

-- place_order: the only new behaviour is the ban check. Without it a banned customer could
-- keep ordering, which would make admin_ban_customer below cosmetic. The existing
-- `status = 'active'` test already blocks new orders against a suspended vendor.
create or replace function public.place_order(
  p_vendor_id bigint, p_pickup_slot_id bigint, p_idempotency_key text, p_items jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid(); v_order_id bigint; v_item jsonb; v_menu public.menu_items%rowtype;
  v_total numeric(10,2) := 0; v_qty integer; v_code text; v_try integer := 0; v_slot public.pickup_slots%rowtype;
begin
  if v_customer is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 12 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'EMPTY_ORDER'; end if;
  if exists (select 1 from public.customers where id = v_customer and banned_at is not null) then
    raise exception 'CUSTOMER_BANNED';
  end if;
  select id into v_order_id from public.orders where idempotency_key=p_idempotency_key;
  if found then
    if exists(select 1 from public.orders where id=v_order_id and customer_id=v_customer) then return v_order_id; end if;
    raise exception 'IDEMPOTENCY_KEY_IN_USE';
  end if;
  if not exists(select 1 from public.vendors where id=p_vendor_id and status='active') then raise exception 'VENDOR_UNAVAILABLE'; end if;
  insert into public.customers(id) values(v_customer) on conflict(id) do nothing;
  if p_pickup_slot_id is not null then
    select * into v_slot from public.pickup_slots where id=p_pickup_slot_id and vendor_id=p_vendor_id and slot_date >= current_date for update;
    if not found or v_slot.orders_count >= v_slot.capacity then raise exception 'PICKUP_SLOT_FULL'; end if;
    update public.pickup_slots set orders_count=orders_count+1 where id=p_pickup_slot_id;
  end if;
  -- Create order after locking slot; a collision rolls back the slot reservation with this transaction.
  loop
    v_code := lpad(floor(random()*1000000)::text,6,'0');
    exit when not exists(select 1 from public.orders where vendor_id=p_vendor_id and pickup_code=v_code and status not in ('collected','cancelled','rejected','no_show'));
    v_try := v_try + 1; if v_try > 10 then raise exception 'PICKUP_CODE_RETRY'; end if;
  end loop;
  insert into public.orders(customer_id,vendor_id,pickup_slot_id,pickup_code,total_amount,idempotency_key)
  values(v_customer,p_vendor_id,p_pickup_slot_id,v_code,0,p_idempotency_key) returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_menu from public.menu_items where id=(v_item->>'menu_item_id')::bigint and vendor_id=p_vendor_id for update;
    if not found or not v_menu.is_available then raise exception 'ITEM_UNAVAILABLE'; end if;
    if v_menu.quantity_remaining is not null then
      if v_menu.quantity_remaining < v_qty then raise exception 'INSUFFICIENT_STOCK: %',v_menu.name; end if;
      update public.menu_items set quantity_remaining=quantity_remaining-v_qty where id=v_menu.id;
    end if;
    v_total := v_total + v_menu.price*v_qty;
    insert into public.order_items(order_id,menu_item_id,name_snapshot,price_snapshot,quantity,subtotal)
      values(v_order_id,v_menu.id,v_menu.name,v_menu.price,v_qty,v_menu.price*v_qty);
  end loop;
  update public.orders set total_amount=v_total where id=v_order_id;
  return v_order_id;
exception when unique_violation then
  select id into v_order_id from public.orders where idempotency_key=p_idempotency_key and customer_id=auth.uid();
  if v_order_id is not null then return v_order_id; end if;
  raise;
end $$;
revoke all on function public.place_order(bigint,bigint,text,jsonb) from public, anon;
grant execute on function public.place_order(bigint,bigint,text,jsonb) to authenticated;

-- advance_order_status: the only change is a guard on the pending -> accepted edge. That
-- edge is the one that takes on new work. Everything downstream (accepted -> preparing ->
-- ready -> collected / no_show) is completion of work already accepted, and rejecting or
-- cancelling a stranded pending order is cleanup, not new work. So a suspended vendor keeps
-- the ability to finish what they already accepted and to clear their queue, and loses only
-- the ability to accept more.
create or replace function public.advance_order_status(p_order_id bigint,p_next_status text,p_rejection_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_vendor boolean; v_admin boolean;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select exists(select 1 from public.vendor_accounts where id=auth.uid() and vendor_id=v_order.vendor_id),
         exists(select 1 from public.admin_users where id=auth.uid()) into v_vendor,v_admin;
  if not v_vendor and not v_admin then raise exception 'FORBIDDEN'; end if;
  if not ((v_order.status='pending' and p_next_status in ('accepted','rejected')) or
          (v_order.status='accepted' and p_next_status in ('preparing','cancelled')) or
          (v_order.status='preparing' and p_next_status='ready') or
          (v_order.status='ready' and p_next_status in ('collected','no_show'))) then raise exception 'INVALID_STATUS_TRANSITION'; end if;
  if p_next_status='accepted'
     and not exists (select 1 from public.vendors v where v.id=v_order.vendor_id and v.status in ('pending','active'))
  then raise exception 'VENDOR_NOT_OPERATIONAL'; end if;
  if p_next_status='rejected' and nullif(trim(p_rejection_reason),'') is null then raise exception 'REJECTION_REASON_REQUIRED'; end if;
  update public.orders set status=p_next_status,
    rejection_reason=case when p_next_status='rejected' then trim(p_rejection_reason) else rejection_reason end,
    accepted_at=case when p_next_status='accepted' then now() else accepted_at end,
    ready_at=case when p_next_status='ready' then now() else ready_at end,
    collected_at=case when p_next_status='collected' then now() else collected_at end,
    cancelled_at=case when p_next_status='cancelled' then now() else cancelled_at end
  where id=p_order_id;
  if p_next_status in ('rejected','cancelled') then
    if v_order.pickup_slot_id is not null then
      update public.pickup_slots set orders_count=greatest(orders_count-1,0) where id=v_order.pickup_slot_id;
    end if;
    update public.menu_items mi set quantity_remaining=mi.quantity_remaining+oi.quantity
      from public.order_items oi where oi.order_id=p_order_id and oi.menu_item_id=mi.id and mi.quantity_remaining is not null;
  end if;
end $$;
revoke all on function public.advance_order_status(bigint,text,text) from public, anon;
grant execute on function public.advance_order_status(bigint,text,text) to authenticated;

-- ============================================================
-- 3. AUDITED ADMIN ACTIONS
-- ============================================================
--
-- Same shape as admin_approve_vendor in 002: SECURITY DEFINER, authorized against
-- auth.uid() on the caller's own session, and writing the change and its admin_audit_log
-- row in one transaction. Every one is revoked from public/anon and granted to
-- authenticated, so PostgREST exposes them to signed-in callers and nobody else.

-- ------------------------------------------------------------
-- 3.1 Vendor suspension
-- ------------------------------------------------------------
create or replace function public.admin_suspend_vendor(p_vendor_id bigint, p_reason text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_vendor public.vendors%rowtype;
  v_inflight integer;
begin
  if v_admin is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;

  select * into v_vendor from public.vendors where id = p_vendor_id for update;
  if not found then raise exception 'VENDOR_NOT_FOUND'; end if;
  if v_vendor.status not in ('pending','active') then raise exception 'VENDOR_NOT_SUSPENDABLE'; end if;

  -- Counted before the status change, and returned rather than acted on: ADR-007 says
  -- in-flight orders run to completion, so the panel's job is to tell the admin how many
  -- are still owed, not to stop them.
  select count(*) into v_inflight from public.orders
   where vendor_id = p_vendor_id and status in ('accepted','preparing','ready');

  update public.vendors
     set status = 'suspended', suspended_at = now(), suspended_reason = trim(p_reason), suspended_by = v_admin
   where id = p_vendor_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  values (v_admin, 'vendor.suspend', 'vendors', p_vendor_id::text,
          jsonb_build_object('status', v_vendor.status, 'name', v_vendor.name),
          jsonb_build_object('status', 'suspended', 'in_flight_orders', v_inflight),
          trim(p_reason));

  return jsonb_build_object(
    'id', p_vendor_id, 'status', 'suspended', 'name', v_vendor.name,
    'in_flight_orders', v_inflight);
end $$;
revoke all on function public.admin_suspend_vendor(bigint, text) from public, anon;
grant execute on function public.admin_suspend_vendor(bigint, text) to authenticated;

create or replace function public.admin_reactivate_vendor(p_vendor_id bigint, p_reason text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_vendor public.vendors%rowtype;
begin
  if v_admin is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;

  select * into v_vendor from public.vendors where id = p_vendor_id for update;
  if not found then raise exception 'VENDOR_NOT_FOUND'; end if;
  if v_vendor.status <> 'suspended' then raise exception 'VENDOR_NOT_SUSPENDED'; end if;

  update public.vendors
     set status = 'active', suspended_at = null, suspended_reason = null, suspended_by = null
   where id = p_vendor_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  values (v_admin, 'vendor.reactivate', 'vendors', p_vendor_id::text,
          jsonb_build_object('status', 'suspended', 'name', v_vendor.name),
          jsonb_build_object('status', 'active', 'name', v_vendor.name),
          trim(p_reason));

  return jsonb_build_object('id', p_vendor_id, 'status', 'active', 'name', v_vendor.name);
end $$;
revoke all on function public.admin_reactivate_vendor(bigint, text) from public, anon;
grant execute on function public.admin_reactivate_vendor(bigint, text) to authenticated;

-- Replaces vendors_admin_insert. Always creates the row as 'pending', so an admin cannot
-- shortcut approval by provisioning a vendor straight into 'active'.
create or replace function public.admin_provision_vendor(
  p_name text, p_area text default null, p_phone text default null,
  p_address text default null, p_description text default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_id bigint;
begin
  if v_admin is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'VENDOR_NAME_REQUIRED'; end if;

  insert into public.vendors (name, area, phone, address, description, status)
  values (trim(p_name), nullif(trim(coalesce(p_area,'')),''), nullif(trim(coalesce(p_phone,'')),''),
          nullif(trim(coalesce(p_address,'')),''), nullif(trim(coalesce(p_description,'')),''), 'pending')
  returning id into v_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, after_state, reason)
  values (v_admin, 'vendor.provision', 'vendors', v_id::text,
          jsonb_build_object('name', trim(p_name), 'area', p_area, 'status', 'pending'),
          nullif(trim(coalesce(p_reason,'')),''));

  return jsonb_build_object('id', v_id, 'status', 'pending', 'name', trim(p_name));
end $$;
revoke all on function public.admin_provision_vendor(text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_provision_vendor(text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3.2 Customer bans
-- ------------------------------------------------------------
-- A ban is only real because place_order above now refuses banned customers. The customer's
-- own UPDATE grant is (name, phone) only, so they cannot lift it themselves.

create or replace function public.admin_ban_customer(p_customer_id uuid, p_reason text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;
  if p_customer_id is null or not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if exists (select 1 from public.customers where id = p_customer_id and banned_at is not null) then
    raise exception 'CUSTOMER_ALREADY_BANNED';
  end if;

  update public.customers set banned_at = now(), banned_reason = trim(p_reason), banned_by = v_admin
   where id = p_customer_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, after_state, reason)
  values (v_admin, 'customer.ban', 'customers', p_customer_id::text,
          jsonb_build_object('banned', true), trim(p_reason));

  return jsonb_build_object('id', p_customer_id, 'banned', true);
end $$;
revoke all on function public.admin_ban_customer(uuid, text) from public, anon;
grant execute on function public.admin_ban_customer(uuid, text) to authenticated;

create or replace function public.admin_unban_customer(p_customer_id uuid, p_reason text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;
  if p_customer_id is null or not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and banned_at is not null) then
    raise exception 'CUSTOMER_NOT_BANNED';
  end if;

  update public.customers set banned_at = null, banned_reason = null, banned_by = null
   where id = p_customer_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, after_state, reason)
  values (v_admin, 'customer.unban', 'customers', p_customer_id::text,
          jsonb_build_object('banned', false), trim(p_reason));

  return jsonb_build_object('id', p_customer_id, 'banned', false);
end $$;
revoke all on function public.admin_unban_customer(uuid, text) from public, anon;
grant execute on function public.admin_unban_customer(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3.3 Force-cancel
-- ------------------------------------------------------------
-- The highest-risk action in the panel. The guide's exit criterion is that a force-cancelled
-- order leaves no stock or slot capacity locked. The reversal below is deliberately the
-- same shape as the cancel path inside advance_order_status, and the audit row records the
-- restored quantities so a mismatch can be reconciled after the fact.
create or replace function public.admin_force_cancel_order(p_order_id bigint, p_reason text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_order public.orders%rowtype;
  v_vendor_name text;
  v_restored jsonb;
begin
  if v_admin is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('collected','cancelled','rejected','no_show') then
    raise exception 'ORDER_ALREADY_CLOSED';
  end if;

  select name into v_vendor_name from public.vendors where id = v_order.vendor_id;

  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;

  if v_order.pickup_slot_id is not null then
    update public.pickup_slots set orders_count = greatest(orders_count - 1, 0)
     where id = v_order.pickup_slot_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'menu_item_id', oi.menu_item_id, 'name', oi.name_snapshot, 'quantity', oi.quantity)), '[]'::jsonb)
    into v_restored
    from public.order_items oi
   where oi.order_id = p_order_id
     and exists (select 1 from public.menu_items mi
                  where mi.id = oi.menu_item_id and mi.quantity_remaining is not null);

  update public.menu_items mi set quantity_remaining = mi.quantity_remaining + oi.quantity
    from public.order_items oi
   where oi.order_id = p_order_id and oi.menu_item_id = mi.id and mi.quantity_remaining is not null;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  values (v_admin, 'order.force_cancel', 'orders', p_order_id::text,
          jsonb_build_object('status', v_order.status, 'pickup_code', v_order.pickup_code,
                             'total_amount', v_order.total_amount, 'vendor', v_vendor_name),
          jsonb_build_object('status', 'cancelled', 'stock_restored', v_restored,
                             'slot_released', v_order.pickup_slot_id is not null),
          trim(p_reason));

  return jsonb_build_object(
    'id', p_order_id, 'status', 'cancelled',
    'stock_restored', v_restored,
    'slot_released', v_order.pickup_slot_id is not null);
end $$;
revoke all on function public.admin_force_cancel_order(bigint, text) from public, anon;
grant execute on function public.admin_force_cancel_order(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 3.4 Disputes
-- ------------------------------------------------------------
-- disputes has a read policy and no write policy at all, so nothing in the system can move
-- one. This is the only way an admin can pick one up or close it.
create or replace function public.admin_resolve_dispute(
  p_dispute_id bigint, p_status text, p_resolution_notes text, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_dispute public.disputes%rowtype;
  v_notes text := nullif(trim(coalesce(p_resolution_notes,'')),'');
  v_closing boolean := p_status in ('resolved','rejected');
begin
  if v_admin is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  -- 'open' is deliberately not a target: a new dispute starts open, and there is no way
  -- back to open once someone has picked it up.
  if p_status not in ('investigating','resolved','rejected') then raise exception 'INVALID_DISPUTE_STATUS'; end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if v_dispute.status in ('resolved','rejected') then raise exception 'DISPUTE_ALREADY_CLOSED'; end if;

  -- Closing a dispute without recording what was decided would produce an unanswerable
  -- record, so the notes are required at exactly the point they stop being optional.
  if v_closing and v_notes is null then raise exception 'RESOLUTION_NOTES_REQUIRED'; end if;

  update public.disputes
     set status = p_status,
         resolution_notes = coalesce(v_notes, resolution_notes),
         resolved_by = case when v_closing then v_admin else resolved_by end,
         resolved_at = case when v_closing then now() else resolved_at end
   where id = p_dispute_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  values (v_admin, 'dispute.resolve', 'disputes', p_dispute_id::text,
          jsonb_build_object('status', v_dispute.status, 'dispute_type', v_dispute.dispute_type,
                             'order_id', v_dispute.order_id),
          jsonb_build_object('status', p_status, 'resolution_notes', v_notes),
          nullif(trim(coalesce(p_reason,'')),''));

  return jsonb_build_object('id', p_dispute_id, 'status', p_status);
end $$;
revoke all on function public.admin_resolve_dispute(bigint, text, text, text) from public, anon;
grant execute on function public.admin_resolve_dispute(bigint, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3.5 Super-admin-only actions
-- ------------------------------------------------------------
-- The first real use of is_super_admin(). Until this migration it was defined and called
-- by nothing, so support_admin and super_admin behaved identically.

create or replace function public.admin_provision_admin(
  p_user_id uuid, p_email text, p_role text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if p_user_id is null then raise exception 'USER_ID_REQUIRED'; end if;
  if nullif(trim(coalesce(p_email,'')),'') is null then raise exception 'EMAIL_REQUIRED'; end if;
  if p_role not in ('super_admin','support_admin') then raise exception 'INVALID_ROLE'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;
  if exists (select 1 from public.admin_users where id = p_user_id) then
    raise exception 'ADMIN_ALREADY_EXISTS';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'AUTH_USER_NOT_FOUND';
  end if;

  insert into public.admin_users (id, email, role) values (p_user_id, trim(p_email), p_role);

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, after_state, reason)
  values (v_admin, 'admin.provision', 'admin_users', p_user_id::text,
          jsonb_build_object('email', trim(p_email), 'role', p_role), trim(p_reason));

  return jsonb_build_object('id', p_user_id, 'email', trim(p_email), 'role', p_role);
end $$;
revoke all on function public.admin_provision_admin(uuid, text, text, text) from public, anon;
grant execute on function public.admin_provision_admin(uuid, text, text, text) to authenticated;

create or replace function public.admin_set_admin_role(
  p_user_id uuid, p_role text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_target public.admin_users%rowtype;
  v_remaining integer;
begin
  if v_admin is null or not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if p_role not in ('super_admin','support_admin') then raise exception 'INVALID_ROLE'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;

  select * into v_target from public.admin_users where id = p_user_id for update;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
  if v_target.role = p_role then raise exception 'ROLE_UNCHANGED'; end if;

  -- Without this, the last super_admin can demote themselves and permanently lock everyone
  -- out of this section, with no way back in through the panel.
  if v_target.role = 'super_admin' and p_role <> 'super_admin' then
    select count(*) into v_remaining from public.admin_users
     where role = 'super_admin' and id <> p_user_id;
    if v_remaining = 0 then raise exception 'LAST_SUPER_ADMIN'; end if;
  end if;

  update public.admin_users set role = p_role where id = p_user_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  values (v_admin, 'admin.role_change', 'admin_users', p_user_id::text,
          jsonb_build_object('role', v_target.role, 'email', v_target.email),
          jsonb_build_object('role', p_role, 'email', v_target.email),
          trim(p_reason));

  return jsonb_build_object('id', p_user_id, 'role', p_role);
end $$;
revoke all on function public.admin_set_admin_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_admin_role(uuid, text, text) to authenticated;

create or replace function public.admin_update_setting(p_key text, p_value jsonb, p_reason text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_setting public.platform_settings%rowtype;
begin
  if v_admin is null or not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_key,'')),'') is null then raise exception 'SETTING_KEY_REQUIRED'; end if;
  if p_value is null then raise exception 'SETTING_VALUE_REQUIRED'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REASON_REQUIRED'; end if;

  select * into v_setting from public.platform_settings where key = p_key for update;
  if not found then raise exception 'SETTING_NOT_FOUND'; end if;

  update public.platform_settings set value = p_value, updated_by = v_admin, updated_at = now()
   where key = p_key;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  values (v_admin, 'settings.update', 'platform_settings', p_key,
          jsonb_build_object('value', v_setting.value),
          jsonb_build_object('value', p_value),
          trim(p_reason));

  return jsonb_build_object('key', p_key, 'value', p_value, 'previous', v_setting.value);
end $$;
revoke all on function public.admin_update_setting(text, jsonb, text) from public, anon;
grant execute on function public.admin_update_setting(text, jsonb, text) to authenticated;
