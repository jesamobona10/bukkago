# Super Admin Panel — Specification
## Food Booking System

**Status:** Draft — contains explicit assumptions and open decisions flagged for confirmation
**Companion to:** PRD, TRD, Backend Schema, System Design

---

## 1. Purpose

A single console for platform operators (initially just Jesam) to oversee everything happening across every vendor, order, customer, and payment on the platform — the things an individual vendor dashboard deliberately can't see or touch.

Where the vendor dashboard answers *"what's happening at my bukka today,"* the Super Admin Panel answers *"is the whole platform healthy, and can I intervene when something goes wrong."*

## 2. Design Principles
- **Oversight, not operations.** Admins monitor and intervene; they don't run a vendor's day-to-day menu for them (that stays vendor-owned).
- **Every sensitive action is accountable.** Anything an admin does that changes money, access, or account status is logged immutably (see §6, Audit Log).
- **Read access is broad; write access is narrow and deliberate.** Admins can see everything happening on the platform, but the panel should make it hard to make a destructive change by accident.

## 3. Panel Sections

### 3.1 Overview Dashboard
Platform-wide KPIs at a glance:
- Orders today (by status: pending/preparing/ready/collected/no-show)
- Revenue today / this week
- Active vendors vs. pending applications
- Open disputes count
- Any system alerts (e.g., payment webhook failures, unusually high no-show rate)

### 3.2 Vendor Management
- List all vendors, filterable by status (pending / active / suspended / rejected)
- Approve or reject pending vendor applications, with a reason
- Suspend or reactivate an active vendor, with a mandatory reason
- View a vendor's detail page: their menu, order history, revenue, no-show rate
- *(Open question — see §7.3: can admins directly edit a vendor's menu/prices, or only suspend/approve?)*

### 3.3 Order Oversight
- Platform-wide order list, searchable/filterable by vendor, customer, status, date range
- Drill into any single order's full detail and status history
- Manually intervene on a stuck/disputed order (force-cancel, force-refund) — logged, with a reason required

### 3.4 Customer Management
- List customers, view order history per customer
- Suspend/ban a customer account (for abuse, repeated no-shows, fraud signals)
- View a customer's no-show rate

### 3.5 Disputes & Refunds
- A queue of disputes raised (by customer, by vendor, or auto-flagged by the system — e.g. repeated no-shows)
- Each dispute has a type (quality issue / no-show dispute / payment issue / other), status (open / investigating / resolved / rejected), and resolution notes
- Refund issuance tied to a dispute or a direct admin action, always with a reason and an audit trail entry
- *(Open question — see §7.4: is there a refund amount threshold requiring extra approval?)*

### 3.6 Payments Oversight
- View all payment transactions platform-wide
- Reconciliation view: payments confirmed vs. orders marked paid (catches webhook/sync issues)
- Manual refund/adjustment tools (feeds into §3.5's audit trail)

### 3.7 Admin User Management
- Create and manage other admin accounts
- Assign role/tier *(pending confirmation — see §7.1)*
- View a log of each admin's recent actions

### 3.8 Platform Settings
- Default commission rate (and per-vendor override if needed)
- Pickup no-show grace period (how long after "Ready" before an order auto-transitions to No-show)
- Notification provider settings (SMS/push)
- Feature flags for gradually rolling out new capabilities

### 3.9 Audit Log
- Immutable, append-only log of every sensitive admin action: who, what, on which record, when, and why
- Searchable/filterable — this is the platform's accountability record and the first place to look during any dispute investigation

### 3.10 Analytics & Reports
- Order volume and revenue trends over time
- Vendor performance leaderboard
- Platform-wide no-show/walk-away rate — ties directly back to the PRD's core success metric

## 4. Role Model (proposed — pending confirmation)

Default proposal: **two tiers**.

| Role | Can do |
|---|---|
| **Super Admin** | Everything, including managing other admin accounts and platform settings, and approving refunds above any configured threshold |
| **Support Admin** | Day-to-day oversight — vendor approval, order investigation, disputes, refunds within a configured threshold — but cannot manage admin accounts or platform settings |

*This is a starting assumption, not a decision — confirmed in §7.1.*

## 5. Permissions Matrix (draft)

| Action | Super Admin | Support Admin |
|---|---|---|
| View all vendors/orders/customers/payments | ✅ | ✅ |
| Approve/reject vendor application | ✅ | ✅ |
| Suspend/reactivate vendor | ✅ | ✅ |
| Edit vendor menu/prices directly | *pending §7.3* | *pending §7.3* |
| Force-cancel/refund an order | ✅ | Within threshold — *pending §7.4* |
| Suspend/ban a customer | ✅ | ✅ |
| Resolve disputes | ✅ | ✅ |
| Issue refund | ✅, any amount | Within threshold — *pending §7.4* |
| Manage admin accounts | ✅ | ❌ |
| Edit platform settings | ✅ | ❌ |
| View audit log | ✅ | ✅ (own actions + all, for accountability) |

## 6. Audit Log — Non-Negotiable Requirement

Every action that touches money, account status, or access must write an audit log entry:
- Vendor approved/rejected/suspended/reactivated
- Order force-cancelled or force-refunded
- Customer suspended/banned
- Refund issued (amount, reason, linked dispute if any)
- Admin account created, role changed, or deactivated
- Platform setting changed (old value → new value)

The audit log is **append-only by design** — no admin, including Super Admin, should be able to edit or delete an entry through the application. This is enforced at the database layer (see Schema doc §RLS), not just hidden in the UI.

## 7. Open Decisions — Resolved

> **Resolved 2026-09-30.** All four answered; see `11-SUPER-ADMIN-DECISIONS.md` for the
> reasoning and the one deviation from the implementation guide. Summary:
> §7.1 **two tiers** · §7.2 **audited `SECURITY DEFINER` functions called with the admin's
> own session** · §7.3 **admin authority stops at approve/reject/suspend** · §7.4 **no
> threshold, mechanism left in place**. Implemented in
> `supabase/migrations/202609290002_super_admin_panel.sql`.

These four materially changed the schema and RLS design in the companion document, so the
answers were confirmed before the schema was treated as final:

### 7.1 Role tiers
**Answered: the two-tier Super Admin / Support Admin model** in §4. `admin_users.role`
exists, defaulting to `support_admin`, and every `role = 'super_admin'` check in the
companion document applies as written.

### 7.2 Authorization model for sensitive writes
**Answered: the second option**, with one correction to the guide's implementation. Direct
authenticated writes to `vendors.suspended_*` and `customers.banned_*` are blocked, and the
audit-log trigger approach is not needed. But rather than route handlers performing the
write with the service-role key and *then* inserting an audit row, each sensitive action is
a `SECURITY DEFINER` Postgres function that does the write and the `admin_audit_log` insert
in one transaction, invoked with the acting admin's own session — see ADR-004.

### 7.3 Vendor menu editing
**Answered: admin authority stops at approve/suspend.** The `is_admin()` clause is removed
from the `menu_items` write policy, matching the "oversight, not operations" principle in
§2. The real policy name is `menu_vendor_manage`, not `menu_items_write_vendor`.

### 7.4 Refund approval threshold
**Answered: no threshold for now.** `refund_approval_threshold_ngn` is seeded to JSON `null`
and `refunds.approved_by` is unused. The column, setting and Super-Admin-only write policy
all exist, so a maker-checker flow can be introduced in Phase 4 without a new migration.
