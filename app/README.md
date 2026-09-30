# BukkaGo web app

Next.js 14 App Router. Install and run from the repository root (`npm install`, `npm run dev`); this folder is an npm workspace, so the root scripts proxy to it.

Routes:
- `/` customer discovery, menu, checkout preview, order status preview — sample data
- `/vendor` vendor order board, stock toggles, pickup-code interaction — sample data
- `/admin/login` admin sign-in
- `/admin` Super Admin Panel overview — live Supabase data
- `/admin/vendors` pending vendor applications with audited approve/reject — live Supabase data
- `/api/admin/vendors/[id]/{approve,reject}` audited POST endpoints

The customer and vendor routes are still prototypes on local state and do not persist or charge anyone. The admin routes are the first part wired to the real schema and are enforced by RLS plus `SECURITY DEFINER` database functions.

## Layout

`src/app/admin/(panel)/` is a route group so the sidebar layout in `layout.tsx` does not wrap the login page. The group does not appear in the URL — `(panel)/page.tsx` serves `/admin`.

`src/lib/` holds the server-side plumbing: `supabase/` (browser, server, middleware and env-checked clients), `security.ts` (session and role gates), `admin-audit.ts` (the wrapper around audited RPCs), `dates.ts` (West Africa Time day/week boundaries) and `admin/overview.ts` (the dashboard's queries and alerting rules).

`src/middleware.ts` is matched to `/admin` and `/api/admin` only, so the prototype screens keep working on a project with no Supabase configuration.
