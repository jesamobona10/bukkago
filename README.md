# BukkaGo

BukkaGo is a pickup-first food ordering system for neighbourhood bukkas. The first app slice follows the supplied PRD and UI brief: vendor discovery, menus, sold-out states, cart, pickup slot selection, checkout review, and order tracking.

## Current implementation

- `app/` contains a Next.js 14 mobile-first customer experience (`/`) and a vendor order board (`/vendor`), both still running on local sample data.
- `app/src/app/admin/` contains the **Super Admin Panel**, the first part of the app wired to Supabase. It is live against the real schema: `/admin` is a platform-health overview and `/admin/vendors` reviews vendor applications, with every approve/reject written to an append-only audit log.
- `supabase/migrations/202609290001_initial_schema.sql` contains the initial Postgres schema, RLS, atomic stock and slot reservation RPC, status-transition RPC, and pickup verification RPC.
- `supabase/migrations/202609290002_super_admin_panel.sql` adds the super admin schema: role tiers, vendor suspension and customer ban columns, and the `disputes`, `refunds`, `admin_audit_log` and `platform_settings` tables.
- `DOCS/` remains the product and engineering specification. `11-SUPER-ADMIN-DECISIONS.md` records the four open design questions the spec was waiting on.

The customer and vendor screens are still a visual prototype: checkout and order updates use local state. Customer auth, persisted vendor data, Paystack initialization/webhooks/refunds, notifications, and the vendor Today's Board still need connection before a real pilot. The sample pickup code and payment confirmation are not real transactions.

## Run locally

1. Install Node.js 18.17+ and npm.
2. `npm install` from the repository root. The root `package.json` declares `app/` as an npm workspace and proxies the app scripts.
3. Copy `app/.env.example` to `app/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. `npm run dev` from the repository root and open `http://localhost:3000`.

`/` and `/vendor` work with no Supabase configuration at all. The admin middleware is scoped to `/admin` and `/api/admin`, so a missing `.env.local` cannot break the prototype screens — the admin login page will tell you what is missing.

## Supabase setup

Install the Supabase CLI, link a development project, then run `supabase db push` from the repository root.

### Bootstrap the first admin

Admins are provisioned by hand, not self-served:

1. Sign up through Supabase Auth (Authentication → Users → Add user, or the customer signup once it exists).
2. Copy that user's UUID and insert it:

```sql
insert into public.admin_users (id, email, role)
values ('<user-uuid>', 'you@example.com', 'super_admin');
```

### Seed demo data

`supabase/seed.sql` runs automatically on `supabase db reset` and inserts vendors, menus and pickup slots. Orders, payments and disputes need a real `auth.users` row, so they are a separate step:

```bash
psql "$SUPABASE_DB_URL" -v customer_id='<uuid>' -f supabase/seed-demo-orders.sql
```

The script fails with a clear message if you forget `-v customer_id=`.

The service role key and Paystack secret must only be used by server-side code and must never use a `NEXT_PUBLIC_` prefix. Note that the Super Admin Panel does **not** use `SUPABASE_SERVICE_ROLE_KEY` at all — audited actions run as `SECURITY DEFINER` database functions against the admin's own session, so there is no service-role key in any route handler to leak. See `DOCS/11-SUPER-ADMIN-DECISIONS.md` ADR-004.

## Build sequence

Super Admin Panel, following `DOCS/10-SUPER-ADMIN-IMPLEMENTATION-GUIDE.md`:

- **Phase 1 — done.** Schema, auth middleware, admin login, Overview dashboard, vendor approval as the first audited action.
- **Phase 2 — done.** Vendor list/detail with suspend and reactivate; customer list/detail with ban.
- **Phase 3 — done.** Platform-wide order list, dispute queue, manual force-cancel with stock and slot reversal.
- **Phase 4 — dropped.** Refund issuance against Paystack and payment reconciliation are out of scope for this build. There is no payment provider wired up, so a refund screen would have nothing real to act on. `/admin/payments` and `/admin/refunds` are the only nav entries still marked unbuilt.
- **Phase 5 — done.** Admin account management and platform settings, both Super-Admin-only.
- **Phase 6 — done.** Full audit log UI with before/after diffs, plus 7/30/90-day reports.

All three migrations (`202609290001`, `202609290002`, `202609300003_admin_oversight.sql`) are applied to the live project.

Demo data lives in `supabase/seed.sql` (vendors, menus, slots) and `supabase/seed-admin-demo.sql` (orders, payments, disputes). `scripts/seed-admin-demo.py` creates the same rows over the REST API, which is how you get the two Auth identities the column-privilege checks below need — an admin session cannot test them, because admins have no direct write path to a vendor at all.

Core platform: connect customer auth, replace sample vendor/menu/slot data with RLS-scoped queries and realtime subscriptions, add server-side order creation calling `place_order` with client-generated idempotency keys, add Paystack initialize plus a signature-verified webhook, then notifications and pilot monitoring.

See `DOCS/07-IMPLEMENTATION-PLAN.md` for the core platform's phase exit criteria.

## Verifying the audit guarantees

The guide's testing checklist is the point of the panel, and none of it can be checked from the UI alone. With a project connected, sign in as an admin and paste these into the Supabase SQL editor:

```sql
-- The audit log rejects edits, for every role including the table owner.
update public.admin_audit_log set reason = 'tampered' where id = 1;
delete from public.admin_audit_log where id = 1;

-- Admins have no direct write path to a vendor, so they cannot skip the audit log.
update public.vendors set status = 'suspended' where id = 1;

-- Nor can a super admin change the commission rate without an audit row.
update public.platform_settings set value = '0'::jsonb where key = 'commission_rate';
```

All four should raise — `ADMIN_AUDIT_LOG_APPEND_ONLY` for the first two, and a RLS violation for the last two. Sensible writes go through `admin_approve_vendor` / `admin_reject_vendor`, which record the action and the reason in the same transaction.

The next two are the checks that RLS cannot express at all, because column privileges are doing the work. Run them signed in as a **vendor owner** (not an admin):

```sql
-- Must fail with 42501: this is the self-approval hole closed in migration 003.
update public.vendors set status = 'active' where id = 1;

-- Must fail with 42501: a vendor could otherwise mint pickup capacity.
update public.pickup_slots set orders_count = 0 where vendor_id = 1;

-- Must still succeed: owners legitimately edit their own details.
update public.vendors set phone = '08000000000' where id = 1;
```

`scripts/seed-admin-demo.py` maps `vendor@bukkago.com` to vendor 1, so those ids are already filled in. All three were confirmed against the live project. The full column grant set is worth checking the same way: owners may write `name`, `description`, `logo_url`, `area`, `address`, `phone` and `avg_prep_time_minutes` on `vendors`, and `start_time`, `end_time` and `capacity` on `pickup_slots`; `status`, `suspended_at`, `suspended_reason`, `suspended_by` and `commission_rate` all raise. `commission_rate` is intentionally not reachable even for a Super Admin outside `admin_update_setting`.

`DOCS/11-SUPER-ADMIN-DECISIONS.md` ADR-008 explains why a correct `vendors_manage` policy was not enough.

The one to check by hand for customers, same reasoning: sign in as a *banned customer* and try to run

```sql
update public.customers set banned_at = null, banned_reason = null where id = auth.uid();
```

That must fail with a permission error, while `update public.customers set name = 'x' where id = auth.uid()` still succeeds.

Finally, `admin_set_admin_role` refuses to demote the last Super Admin, so try demoting yourself from a single-admin account and confirm it raises `LAST_SUPER_ADMIN` rather than locking the panel.
