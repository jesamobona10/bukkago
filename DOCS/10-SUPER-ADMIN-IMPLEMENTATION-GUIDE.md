# Super Admin Panel — Implementation Guide
## Food Booking System

> **Status: in progress.** The four open decisions in `08-SUPER-ADMIN-PANEL-SPEC.md` §7 were
> answered on 2026-09-30 and are recorded in `11-SUPER-ADMIN-DECISIONS.md`. Phase 1 is built
> in `app/src/app/admin/`, `app/src/lib/` and
> `supabase/migrations/202609290002_super_admin_panel.sql`.
>
> **Correction to §2 below:** the `withAdminAudit` snippet it proposes performs the write and
> the audit-log insert as two separate calls, so an audit failure leaves an unlogged
> sensitive change, and it passes the service-role client through, which makes
> `auth.uid()` null and its own `is_admin()` check unevaluable. The implemented replacement
> is `app/src/lib/admin-audit.ts`, which calls a `SECURITY DEFINER` Postgres function on the
> admin's own session — the function does the write and the audit insert in one transaction.
> See ADR-004.
>
> **Also note:** the route tree in §1 assumes `app/admin/page.tsx` is a tabbed panel. The
> pre-existing sample-data screen at that path was replaced; the sidebar shell now lives in
> `app/admin/(panel)/layout.tsx`, and `(panel)` is a route group so the login page stays
> outside it.

**Prerequisite:** the four open decisions in `08-SUPER-ADMIN-PANEL-SPEC.md` §7 should be confirmed before Phase 1 begins — they change the schema and RLS, and building against a draft here means redoing migrations later.

---

## 0. Before You Start
- [ ] Confirm §7.1–§7.4 from the spec
- [ ] Apply the alterations and new tables from `09-SUPER-ADMIN-SCHEMA.md` §1–§2 to your Supabase project
- [ ] Apply the RLS policies from §3, using the branch that matches your confirmed decisions
- [ ] Create your own `admin_users` row (or promote an existing one) with `role = 'super_admin'` so you have a working account to build against

## 1. Route & Folder Structure

Mirrors the existing project's admin panel pattern (tabbed sections within `/admin`), extended with the sections from the spec:

```
app/admin/
 ├─ page.tsx                    → Overview Dashboard
 ├─ vendors/
 │   ├─ page.tsx                 → Vendor list + filters
 │   └─ [id]/page.tsx             → Vendor detail (orders, menu, revenue, suspend action)
 ├─ orders/
 │   ├─ page.tsx                 → Platform-wide order list
 │   └─ [id]/page.tsx             → Order detail + manual intervention
 ├─ customers/
 │   ├─ page.tsx                 → Customer list
 │   └─ [id]/page.tsx             → Customer detail + ban action
 ├─ disputes/
 │   ├─ page.tsx                 → Dispute queue
 │   └─ [id]/page.tsx             → Dispute detail + resolution
 ├─ refunds/
 │   └─ page.tsx                 → Refund queue + issuance
 ├─ payments/
 │   └─ page.tsx                 → Payment reconciliation view
 ├─ admins/
 │   └─ page.tsx                 → Admin account management (Super Admin only)
 ├─ settings/
 │   └─ page.tsx                 → Platform settings (Super Admin only)
 ├─ audit-log/
 │   └─ page.tsx                 → Searchable audit log
 └─ reports/
     └─ page.tsx                 → Analytics/reports

app/api/admin/
 ├─ vendors/[id]/approve/route.ts
 ├─ vendors/[id]/suspend/route.ts
 ├─ vendors/[id]/reactivate/route.ts
 ├─ orders/[id]/force-cancel/route.ts
 ├─ customers/[id]/ban/route.ts
 ├─ disputes/[id]/resolve/route.ts
 ├─ refunds/route.ts               (POST — request/issue a refund)
 ├─ refunds/[id]/approve/route.ts  (Super Admin sign-off, if threshold applies)
 ├─ admins/route.ts                (Super Admin only — create/list admin accounts)
 ├─ settings/route.ts              (Super Admin only)
 └─ audit-log/route.ts             (GET — searchable read)
```

## 2. A Reusable Pattern: `withAdminAudit`

Since nearly every sensitive route needs the same shape — verify admin, perform the write, log it — build one wrapper early rather than repeating this logic in ten route handlers:

```ts
// lib/admin-audit.ts
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getAuthContext, requireAdmin } from "@/lib/security";

type AuditParams = {
  action: string;
  targetTable: string;
  targetId: string | number;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export async function withAdminAudit(
  supabase: any,
  audit: AuditParams,
  perform: (sb: ReturnType<typeof createServiceRoleClient>) => Promise<unknown>
) {
  const auth = await getAuthContext(supabase);
  const adminError = requireAdmin(auth);
  if (adminError) throw adminError;

  const sb = createServiceRoleClient();
  const result = await perform(sb);

  await sb.from("admin_audit_log").insert({
    admin_id: auth!.userId,
    action: audit.action,
    target_table: audit.targetTable,
    target_id: String(audit.targetId),
    before_state: audit.before ?? null,
    after_state: audit.after ?? null,
    reason: audit.reason ?? null,
  });

  return result;
}
```

Every sensitive route handler (suspend, ban, refund, force-cancel) becomes a thin wrapper around this — which is also what makes "every sensitive action is logged" (spec §6) actually true in practice, rather than a rule someone has to remember to follow in each route.

## 3. Phased Build Plan

### Phase 1 — Foundation
- Apply schema (§0 above)
- Build `withAdminAudit` and confirm it works end-to-end with one trivial action (e.g. vendor approval, which likely already exists from the core platform build)
- Build the Overview Dashboard (read-only — good first screen since it only needs SELECT queries, no sensitive writes yet)
- **Exit criterion:** dashboard shows live counts; one audited action (vendor approve) writes a correct audit log row

### Phase 2 — Vendor & Customer Oversight
- Vendor list, detail, suspend/reactivate (via `withAdminAudit`)
- Customer list, detail, ban (via `withAdminAudit`)
- **Exit criterion:** suspending a vendor immediately blocks new orders against them (verify against the vendor-facing app, not just the admin panel) and produces a correct audit entry

### Phase 3 — Order Oversight & Disputes
- Platform-wide order list/search
- Dispute queue and resolution flow
- Manual order intervention (force-cancel) — highest-risk action in the whole panel, build and test this carefully
- **Exit criterion:** a force-cancelled order correctly reverses any stock/slot reservations made in `place_order` (see Backend Schema RPC) — don't let this leave stock permanently "locked" against a cancelled order

### Phase 4 — Refunds & Payments
- Refund request/issuance flow, wired to the Paystack/Flutterwave refund API
- Payment reconciliation view (compare `payments` table state against processor records)
- If a threshold applies (spec §7.4): Support Admin requests → Super Admin approves flow
- **Exit criterion:** a refund issued in the panel actually reaches the customer's payment method in test mode, and `orders.payment_status` updates correctly afterward

### Phase 5 — Admin Accounts & Platform Settings
- Admin account creation/management (Super Admin only)
- Platform settings screen (commission rate, no-show grace period, feature flags)
- **Exit criterion:** a Support Admin account genuinely cannot reach Super-Admin-only actions — test this by logging in as one, not just by reading the code

### Phase 6 — Audit Log & Reports
- Searchable/filterable audit log UI
- Analytics: order volume, revenue trends, vendor leaderboard, platform-wide no-show rate
- **Exit criterion:** every action taken during Phases 2–5 testing is visible and correctly attributed in the audit log UI

## 4. Testing Checklist (don't skip this — it's the point of the panel)

- [ ] A Support Admin cannot perform a Super-Admin-only action, even by calling the API route directly (not just through the UI)
- [ ] A vendor cannot see another vendor's orders/menu/disputes, even via admin-adjacent routes
- [ ] A customer cannot see another customer's orders/refunds
- [ ] The audit log cannot be edited or deleted through any authenticated role — verify this directly against the database, not just the UI (try an UPDATE/DELETE as an authenticated admin and confirm RLS rejects it)
- [ ] Every sensitive action (suspend, ban, force-cancel, refund) produces exactly one audit log entry with accurate before/after state
- [ ] A refund above the configured threshold (if applicable) is blocked without Super Admin approval
- [ ] Suspending a vendor doesn't silently orphan or corrupt their in-flight orders — decide and test what happens to orders already `Accepted`/`Preparing` at suspension time

## 5. What to Deliberately Defer
- Fine-grained per-admin permission customization beyond the two tiers — not worth building until you actually have more than 2–3 admins
- Automated fraud detection on disputes/no-shows — start with manual review, revisit once there's enough volume to see patterns
- Real-time admin dashboard updates (Supabase Realtime on the Overview screen) — a page refresh is fine for v1; add Realtime here only after it's proven valuable on the customer/vendor side first
