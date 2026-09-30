# Super Admin Panel — Database Schema Additions
## Food Booking System

> **Applied.** This document is no longer a plan. It is implemented in
> `supabase/migrations/202609290002_super_admin_panel.sql`, with the §7 questions answered
> as recorded in `11-SUPER-ADMIN-DECISIONS.md`. Where the code deliberately differs from
> the snippets below, the migration carries a comment explaining why. Known differences:
> the audit log has a `BEFORE UPDATE OR DELETE` raising trigger as well as RLS deny (§3.1);
> `refunds.order_id`/`payment_id` are `ON DELETE RESTRICT` rather than plain references;
> `admin_users` gains a read-only admin-visible policy so audit rows can be attributed;
> §3.2's first block is implemented with `SECURITY DEFINER` functions called on the admin's
> own session rather than service-role route handlers (ADR-004); and §3.2 as written below
> missed three unaudited write paths that the migration closes — see the block in §3.2.

**Builds on:** `05-BACKEND-SCHEMA.md` — this document only contains what's *new or changed*, not a restatement of the full schema.

**Read this alongside `08-SUPER-ADMIN-PANEL-SPEC.md` §7** — several sections below are written to match the *default* answers I'd recommend for the four open questions there. Where a decision changes the SQL, I've marked it clearly with `-- DEPENDS ON §7.x` and shown the alternative.

---

## 1. Alterations to Existing Tables

```sql
-- Admin role tiers — DEPENDS ON §7.1
-- Default assumption: two-tier model (Super Admin / Support Admin)
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'support_admin'
    CHECK (role IN ('super_admin', 'support_admin'));

-- If you instead want a single flat admin role (§7.1, option 1):
-- skip this column entirely, and every RLS check below that references
-- `role = 'super_admin'` should just become a plain admin_users membership check.

-- Vendor suspension + commission
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2); -- NULL = falls back to platform_settings default

-- Customer bans
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT,
  ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES admin_users(id);
```

## 2. New Tables

```sql
-- ============================================================
-- DISPUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS disputes (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  raised_by_type TEXT NOT NULL CHECK (raised_by_type IN ('customer', 'vendor', 'system')),
  raised_by_id UUID,                     -- customer_id or vendor_account id; NULL if system-flagged
  dispute_type TEXT NOT NULL
    CHECK (dispute_type IN ('quality', 'no_show', 'payment', 'other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'rejected')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES admin_users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

-- ============================================================
-- REFUNDS
-- ============================================================
CREATE TABLE IF NOT EXISTS refunds (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  payment_id BIGINT NOT NULL REFERENCES payments(id),
  dispute_id BIGINT REFERENCES disputes(id),  -- nullable — not every refund stems from a formal dispute
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'processed', 'rejected')),
  requested_by UUID NOT NULL REFERENCES admin_users(id),
  approved_by UUID REFERENCES admin_users(id),  -- DEPENDS ON §7.4 — populated only if a threshold/approval flow is wanted
  processor_reference TEXT,               -- Paystack/Flutterwave refund reference once processed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- ============================================================
-- ADMIN AUDIT LOG — append-only, see RLS below
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL,                  -- e.g. 'vendor.suspend', 'refund.approve', 'customer.ban'
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,               -- stored as text since target ids vary in type across tables
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- ============================================================
-- PLATFORM SETTINGS — simple key/value config
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults
INSERT INTO platform_settings (key, value) VALUES
  ('default_commission_rate', '5.0'),
  ('no_show_grace_period_minutes', '30'),
  ('refund_approval_threshold_ngn', 'null')  -- DEPENDS ON §7.4 — set a number once confirmed, or leave null for "no threshold"
ON CONFLICT (key) DO NOTHING;
```

## 3. Row Level Security

### 3.1 Straightforward additions (not dependent on open questions)

```sql
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Disputes: admins see all; the customer/vendor involved in the underlying order can see their own dispute
CREATE POLICY disputes_read ON disputes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = disputes.order_id
      AND (
        orders.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM vendor_accounts WHERE id = auth.uid() AND vendor_id = orders.vendor_id)
      )
    )
  );

-- Refunds: admins see all; customer/vendor involved can see their own
CREATE POLICY refunds_read ON refunds
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = refunds.order_id
      AND (
        orders.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM vendor_accounts WHERE id = auth.uid() AND vendor_id = orders.vendor_id)
      )
    )
  );

-- Audit log: admins can READ (all of it, for accountability) — nobody gets INSERT/UPDATE/DELETE via RLS.
-- Only the service-role key (used server-side in the audited API routes) writes here, bypassing RLS entirely.
CREATE POLICY admin_audit_log_read ON admin_audit_log
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
-- Deliberately no INSERT/UPDATE/DELETE policy — RLS defaults to deny, which makes this table
-- append-only from every authenticated context except the service role. This is what makes
-- the audit log meaningfully tamper-resistant rather than just "a table nobody's told to edit."

-- Platform settings: admins can read; only Super Admins can write (see §3.2 for the write policy)
CREATE POLICY platform_settings_read ON platform_settings
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
```

### 3.2 Depends on §7.1 (role tiers) and §7.2 (authorization model)

**With the two-tier model and the "backend-enforced only" authorization model (both confirmed — see `11-SUPER-ADMIN-DECISIONS.md`):**

```sql
-- No direct write policies on vendors.suspended_*, customers.banned_*, disputes, refunds
-- or platform_settings for any authenticated role. All of these are written exclusively
-- through SECURITY DEFINER functions (admin_approve_vendor, admin_reject_vendor, and the
-- Phase 4/5 equivalents), which:
--   1. verify the caller is an admin, via auth.uid() on the caller's own session,
--   2. perform the write as the table owner,
--   3. insert a matching admin_audit_log row in the same transaction.
--
-- RLS on these tables therefore only needs SELECT policies (already defined above) — the
-- deliberate absence of an authenticated-role UPDATE/INSERT policy IS the enforcement.

-- Two additional holes had to be closed that this section did not anticipate:

-- (a) vendors_manage in the initial schema granted public.is_admin() a direct UPDATE on
--     the whole vendors row, which would have let any admin change status or commission
--     with no audit entry. Rebuilt for vendor owners only.
DROP POLICY vendors_manage ON vendors;
CREATE POLICY vendors_manage ON vendors
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM vendor_accounts va
                  WHERE va.id = auth.uid() AND va.vendor_id = vendors.id AND va.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM vendor_accounts va
                  WHERE va.id = auth.uid() AND va.vendor_id = vendors.id AND va.role = 'owner'));

-- (b) customers_self_update is a table-level grant, so a banned customer could clear their
--     own banned_at. RLS cannot restrict columns, but privileges can.
REVOKE UPDATE ON customers FROM authenticated;
GRANT UPDATE (name, phone) ON customers TO authenticated;

-- (c) This policy is intentionally NOT created. A super-admin UPDATE policy on
--     platform_settings would be an unaudited write to the platform's money and no-show
--     rules, which §6 forbids. Phase 5 adds admin_update_setting(key, value) instead.
--     is_super_admin() is created now and used by that function.
```

**If instead you prefer direct RLS-permitted writes (the alternative in §7.2):**

```sql
-- Example for vendor suspension — same pattern would repeat for customers.banned_*, disputes, refunds
CREATE POLICY vendors_suspend_admin ON vendors
  FOR UPDATE USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
-- Note: this version still needs the API route to write the admin_audit_log entry —
-- RLS alone can't generate an audit trail, so a trigger (below) becomes necessary
-- if you want writes guaranteed to be logged even from a direct RLS-permitted update.

CREATE OR REPLACE FUNCTION log_vendor_suspension()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
    INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
    VALUES (auth.uid(), 'vendor.suspend', 'vendors', NEW.id::TEXT,
            jsonb_build_object('suspended_at', OLD.suspended_at),
            jsonb_build_object('suspended_at', NEW.suspended_at),
            NEW.suspended_reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_vendor_suspension AFTER UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION log_vendor_suspension();
```

*I'd still lean toward the backend-enforced version even if you don't mind RLS-permitted writes elsewhere in the app — for money- and access-affecting actions specifically, one audited code path is easier to reason about and test than "RLS policy + trigger, and hope nothing writes around them."*

### 3.3 Depends on §7.3 (vendor menu editing)

```sql
-- If admins should be able to directly edit vendor menu items/prices:
-- the existing menu_items_write_vendor policy in 05-BACKEND-SCHEMA.md already covers this —
-- it already includes an admin_users EXISTS clause, so no change needed.

-- If admin authority should stop at approve/suspend, and menu content stays vendor-only:
-- replace the existing policy with a vendor-only version:
DROP POLICY IF EXISTS menu_items_write_vendor ON menu_items;
CREATE POLICY menu_items_write_vendor_only ON menu_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM vendor_accounts WHERE id = auth.uid() AND vendor_id = menu_items.vendor_id)
  );
```

## 4. Summary of the Resolved Decisions

| # | Question | Where it was asked | Answer | Where it landed |
|---|---|---|---|---|
| 1 | Flat vs. two-tier admin roles | Spec §7.1 | Two-tier | `admin_users.role`, `is_super_admin()` (used by Phase 5's `admin_update_setting`) |
| 2 | RLS-permitted vs. backend-enforced sensitive writes | Spec §7.2 | Backend-enforced | No authenticated write policy on the affected tables; `SECURITY DEFINER` functions do write + audit in one transaction (ADR-004). Also closed three holes this doc missed — see §3.2 |
| 3 | Can admins edit vendor menus directly | Spec §7.3 | No | `menu_vendor_manage` dropped and recreated without its `is_admin()` clause |
| 4 | Refund approval threshold amount | Spec §7.4 | None for now | `refund_approval_threshold_ngn` seeded to `null`; `refunds.approved_by` unused but present |

Everything else in this document is final as written.
