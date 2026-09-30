# Super Admin Panel — Decision Record
## Food Booking System

**Status:** Accepted — these four decisions close the open items in `08-SUPER-ADMIN-PANEL-SPEC.md` §7
**Date:** 2026-09-30
**Decider:** Jesam Obona (solo)

`08-SUPER-ADMIN-PANEL-SPEC.md` §7 and `09-SUPER-ADMIN-SCHEMA.md` §4 asked four questions and said the schema and RLS should be treated as draft until they were answered. They are answered now, and `supabase/migrations/202609290002_super_admin_panel.sql` implements them.

---

## ADR-003: Two-tier admin roles

**Decision:** Two tiers — `super_admin` and `support_admin`, added as `admin_users.role` (default `support_admin`).

**Why:** The spec's own testing checklist says "a Support Admin account genuinely cannot reach Super-Admin-only actions — test this by logging in as one." With a single flat role there is nothing to test, and the panel's most dangerous actions (managing other admins, changing platform settings) would be open to anyone with admin access. The cost is one column and one extra policy check.

**Reversible if:** you are ever the only admin and the split becomes ceremony. Dropping the column means replacing `is_super_admin()` with `is_admin()` in three places.

## ADR-004: Sensitive writes go through audited database functions

**Decision:** Money- and access-affecting actions are `SECURITY DEFINER` Postgres functions, called with the **acting admin's own session**. RLS grants no `INSERT`/`UPDATE`/`DELETE` on the affected tables to any authenticated role, and no policy exists on `admin_audit_log` for writes at all.

This is a deliberate deviation from `10-SUPER-ADMIN-IMPLEMENTATION-GUIDE.md` §2, whose `withAdminAudit` snippet has two problems:

1. **The audit insert is a separate call from the write.** If it fails — and `admin_audit_log.admin_id` is `NOT NULL` with a `RESTRICT` foreign key, so it can fail — a money or access change is left with no record. Spec §6 calls the audit log non-negotiable, and a best-effort audit log is not a non-negotiable one.
2. **It passes the service-role client through.** `auth.uid()` is derived from the caller's JWT, so under the service role it is `null`, and any `is_admin()` check evaluated server-side against it always fails. The guide's own call shape cannot enforce what it appears to enforce.

A `SECURITY DEFINER` function is owned by the table owner and therefore bypasses RLS, but still runs with the real caller's `auth.uid()`. Authorization is evaluated by the database against the real person, the write and its audit row are one transaction, and the service-role key is not needed for these actions at all. `SUPABASE_SERVICE_ROLE_KEY` stays in `.env.example` for the Paystack webhook work in Phase 4.

**Consequence for the testing checklist:** "the audit log cannot be edited or deleted through any authenticated role" is enforced twice — RLS denies it, *and* an `admin_audit_log_append_only` trigger raises on `UPDATE`/`DELETE` even for the table owner.

**Four unaudited write paths this decision surfaced.** Writing the migration is what turned this from a principle into a search for holes, and four turned up. Three are fixed; one is deferred with a note in the migration.

1. `vendors_manage` in the initial schema granted `is_admin()` a direct `UPDATE` on the entire `vendors` row. Under this decision that is the hole §7.2 exists to close: any admin could `update vendors set status = 'suspended'` and skip the audit log. The policy is rebuilt for vendor owners only.
2. `customers_self_update` is a table-level `UPDATE` grant, so a *banned* customer could clear their own `banned_at`. RLS policies cannot restrict which columns a row update touches, so this one needed a different mechanism: `revoke update on customers from authenticated` plus `grant update (name, phone)`. Worth remembering that "RLS blocks this write" is not by itself a proof — check the privilege grant too.
3. The schema doc's `platform_settings_write_super_admin_only` policy would have let a super admin change the commission rate or no-show penalty with no `settings.update` audit row, contradicting §6. RLS cannot express "you may write, but only via code that logs first", so there is now no `UPDATE` policy on `platform_settings` at all and Phase 5 adds `admin_update_setting(key, value)` instead. `is_super_admin()` is already in the migration for it.
4. **Not fixed:** `vendors_admin_insert` still lets any admin create a vendor row with no audit entry. §6's list covers approve/reject/suspend/reactivate, not creation, so it stays — but a vendor appearing in the system is exactly the kind of thing an accountability log exists for. Flagged in the migration for Phase 5.

## ADR-005: Admin authority stops at approve / reject / suspend

**Decision:** The `is_admin()` clause is dropped from the `menu_items` write policy, so only a vendor account belonging to that vendor can write its menu.

**Why:** Spec §2 states the principle directly — "oversight, not operations. Admins monitor and intervene; they don't run a vendor's day-to-day menu for them." The initial schema had already granted admins write access to every vendor's menu, which contradicts that.

**Note:** the policy is named `menu_vendor_manage`, not `menu_items_write_vendor` as `09-SUPER-ADMIN-SCHEMA.md` §3.3 assumes. The migration drops the real name.

**Reversible if:** you end up fixing a vendor's prices during the pilot. Re-add `or public.is_admin()` to the policy's `using` and `with check`.

## ADR-006: No refund approval threshold

**Decision:** `refund_approval_threshold_ngn` is seeded to JSON `null`, meaning no threshold. `refunds.approved_by` stays nullable and unused, and any admin may issue any refund.

**Why:** §7.4 asked for a specific naira amount, and there is no answer to give without knowing the volume of a real order and how often a Support Admin will actually be issuing refunds. Rather than pick a number that will be wrong, the mechanism is left in place — the column, the setting, and the Super-Admin-only settings write policy all exist — so introducing a maker-checker flow in Phase 4 is a config change plus a check, not a migration.

---

## What this document does not decide

- **Paystack refund API shape** (Phase 4). No Paystack SDK is in the repo and no secret key is configured.
- **Suspending a vendor with in-flight orders.** The guide's testing checklist flags this and it is still unanswered: does suspension block new orders only, or does it also strand orders already `accepted`/`preparing`? Phase 2 needs this settled before suspend ships.
- **`admin_users` role management.** `admin_users_read_admin` was added so the activity panel can attribute actions to a person, but nothing can yet change a role. That is Phase 5.
