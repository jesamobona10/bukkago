# BukkaGo

BukkaGo is a pickup-first food ordering system for neighbourhood bukkas. The first app slice follows the supplied PRD and UI brief: vendor discovery, menus, sold-out states, cart, pickup slot selection, checkout review, and order tracking.

## Current implementation

- `app/` contains a Next.js 14 mobile-first customer experience with responsive screens and local sample vendor data.
- `supabase/migrations/202609290001_initial_schema.sql` contains the initial Postgres schema, RLS, atomic stock and slot reservation RPC, status-transition RPC, and pickup verification RPC.
- `DOCS/` remains the product and engineering specification.

The current web screens are a visual/product prototype: checkout and order updates use local state. Supabase auth, persisted vendor data, Paystack initialization/webhooks/refunds, notifications, and the vendor/admin dashboards still need connection before a real pilot. The sample pickup code and payment confirmation are not real transactions.

## Run locally

1. Install Node.js 18.17+ and npm.
2. `npm install` from the repository root. The root `package.json` declares `app/` as an npm workspace and proxies the app scripts.
3. Copy `app/.env.example` to `app/.env.local` and set a Supabase project URL and anon key when wiring Supabase.
4. `npm run dev` from the repository root and open `http://localhost:3000`.

## Supabase setup

Install the Supabase CLI, link a development project, then run `supabase db push` from the repository root. The service role key and Paystack secret must only be used by server-side code and must never use a `NEXT_PUBLIC_` prefix. Seed the first admin by inserting its authenticated user UUID and email into `public.admin_users` through a trusted admin session.

## Build sequence

1. Connect Supabase SSR auth and vendor/customer role-aware layouts.
2. Replace sample vendor/menu/slot data with RLS-scoped Supabase queries and realtime subscriptions.
3. Add server-side order creation calling `place_order`, with client-generated idempotency keys.
4. Add Paystack initialize + signature-verified webhook + refund reconciliation.
5. Build vendor Today's Board/menu/slot management and admin vendor approval.
6. Add notifications, offline pickup-code cache, and pilot monitoring.

See `DOCS/07-IMPLEMENTATION-PLAN.md` for phase exit criteria.
