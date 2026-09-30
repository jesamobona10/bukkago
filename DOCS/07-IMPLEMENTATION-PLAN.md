# Implementation Plan
## Food Booking System

Includes Architecture Decision Records (ADRs) for the two open decisions flagged throughout the PRD/TRD/Schema, followed by a phased build plan.

---

## Part A — Architecture Decision Records

### ADR-001: Pickup Time Model

**Status:** Proposed — default direction chosen, pending field research confirmation
**Date:** 2026-09-29
**Deciders:** Jesam Obona (solo)

#### Context
Customers need to specify when they'll collect their order. Two viable models exist: fixed capacity-limited time slots, or a free-form "ready by" time with no cap on concurrent orders.

#### Decision
Default to **fixed pickup slots with capacity** (e.g., 6:00–6:15pm, max 20 orders), pending confirmation from vendor interviews that this matches how they actually want to manage a rush.

#### Options Considered

**Option A: Fixed slots with capacity**
| Dimension | Assessment |
|---|---|
| Complexity | Medium — requires slot generation UI for vendors |
| Cost | None |
| Scalability | Good — caps load per vendor per window |
| Team familiarity | High — same pattern as round-based fixtures in prior project |

**Pros:** Prevents a vendor being overwhelmed with 90 orders for one moment; gives customers a concrete commitment; naturally smooths demand across the rush window.
**Cons:** Less flexible for vendors with unpredictable prep speed; requires vendors to set up slots in advance (friction for non-technical users).

**Option B: Free-form "ready by" time**
| Dimension | Assessment |
|---|---|
| Complexity | Low — no slot management needed |
| Cost | None |
| Scalability | Poor — no cap on simultaneous demand at one time |
| Team familiarity | Medium |

**Pros:** Zero setup burden for vendors; simpler UX for customers.
**Cons:** Reintroduces the exact problem being solved — a vendor could still receive 50 "ready by 6pm" orders and be overwhelmed at the worst possible moment.

#### Trade-off Analysis
Option B is simpler to build but structurally fails to solve the core problem (crowd/overload at peak). Option A adds vendor-side setup friction but directly addresses the stated goal. Given the problem statement is explicitly about *overload at peak*, Option A is the only one that structurally prevents recurrence of the same issue in digital form.

#### Consequences
- Vendors need a simple, fast way to define slots (ideally a default template they can reuse daily, not manual entry every day)
- The schema already supports this (`pickup_slots` table with `capacity`/`orders_count`)
- **Revisit if** vendor interviews show strong resistance to slot setup — in that case, consider a hybrid: system-suggested slots based on `avg_prep_time_minutes`, auto-generated, vendor only adjusts if needed

#### Action Items
1. [ ] Validate with vendor interviews before building slot-management UI
2. [ ] Design an auto-suggested default slot template to minimize vendor setup effort
3. [ ] Build the `place_order` RPC's slot-capacity check (already specified in Backend Schema)

---

### ADR-002: Payment Timing Model

**Status:** Proposed — pending field research confirmation
**Date:** 2026-09-29
**Deciders:** Jesam Obona (solo)

#### Context
Customer research and vendor research may pull in opposite directions: customers may prefer paying only on pickup (feels safer, food is in hand), while vendors need payment commitment to justify cooking for someone who might not show up.

#### Decision
Default to **full prepayment at order time**, with cancellation allowed up to a defined cutoff (e.g., before vendor marks "Preparing"), refunded automatically if a vendor rejects the order.

#### Options Considered

**Option A: Full prepayment**
**Pros:** Eliminates no-show risk for the vendor entirely; simplest payment flow to implement (single charge, single webhook).
**Cons:** Highest friction for customers unfamiliar with paying for food before receiving it; refund flow must be reliable and fast to maintain trust.

**Option B: Pay-on-pickup**
**Pros:** Zero customer friction/trust barrier; matches existing cash-based buying habits.
**Cons:** Does not solve the vendor's no-show risk at all — a vendor could prepare food for an order that never gets collected, which is a real cost the vendor bears. Also removes any commitment signal from the "reservation," undermining the core promise to vendors.

**Option C: Small deposit + balance on pickup**
**Pros:** Balances trust-building with lower friction than full prepay; gives the vendor a partial no-show hedge.
**Cons:** More complex payment/refund logic (two charges or one charge + one manual collection); may confuse first-time users.

#### Trade-off Analysis
Option B undermines the vendor value proposition (the whole point is protecting revenue they're currently losing). Option A is the cleanest technically and commercially, but customer trust is the real risk — worth testing directly in the survey/interviews rather than assuming. Option C is a reasonable middle ground if Option A tests poorly.

#### Consequences
- Requires a reliable, fast refund flow (rejected/cancelled orders) — this needs to work well, or trust collapses quickly
- Webhook-driven payment confirmation is mandatory regardless of which option wins (see TRD §4)
- **Revisit if** survey/interview data shows strong resistance to prepayment — fall back to Option C as the middle path before abandoning prepayment structure entirely

#### Action Items
1. [ ] Add payment-preference questions to ongoing research (already present in the survey — Q7)
2. [ ] Build refund handling into the payment webhook flow regardless of which option is chosen
3. [ ] Keep the payment step behind an interface/abstraction so switching models doesn't require a rewrite (per TRD §2)

---

## Part B — Phased Build Plan

### Phase 0 — Validation (in progress)
- Vendor interviews, customer interviews, online survey
- Synthesize findings → confirm or revise ADR-001, ADR-002, and PRD scope
- **Exit criterion:** at least one bukka owner has agreed, in principle, to pilot this

### Phase 1 — Core Foundations
- Supabase project setup, schema migration (Backend Schema doc), RLS policies
- Auth: customer signup/login, vendor account creation (admin-provisioned, mirroring the team-account pattern from prior projects)
- Admin: minimal vendor approval flow
- **Exit criterion:** a vendor account and a customer account can both log in; empty dashboards render correctly

### Phase 2 — Vendor Menu & Availability
- Vendor dashboard: set today's items, toggle availability, set quantity
- Customer: browse vendor list, view a vendor's live menu
- **Exit criterion:** a vendor can post today's items and a customer can see them update live

### Phase 3 — Ordering & Pickup Slots
- Pickup slot generation (vendor side, with default template per ADR-001)
- Cart, checkout, `place_order` RPC integration
- Order status state machine (Backend Schema + App Flow)
- **Exit criterion:** a full order can be placed end-to-end without payment (payment stubbed/mocked)

### Phase 4 — Payments
- Paystack integration (primary), webhook handler, refund flow
- Wire `payment_status` into the order lifecycle per ADR-002
- **Exit criterion:** a real (test-mode) payment completes and updates order state correctly, including a refund test case

### Phase 5 — Real-Time & Notifications
- Supabase Realtime channels for vendor order queue and customer order status
- Web Push integration; SMS fallback via Termii/Africa's Talking
- Pickup code verification flow (vendor side)
- **Exit criterion:** a vendor sees a new order appear without refreshing; a customer gets notified when their order is Ready

### Phase 6 — Pilot Launch
- Onboard 1 real vendor, run a live trial for 1–2 weeks
- Manually track: walk-away reduction (if observable), order volume, vendor satisfaction, any failure cases
- **Exit criterion:** matches the PRD success metrics — vendor still using it daily after 2 weeks without reverting to walk-in-only

### Phase 7 — Multi-Vendor Expansion
- Onboard additional vendors based on pilot learnings
- Vendor self-service onboarding (reduce Jesam-as-bottleneck for approvals)
- Daily summary/reporting for vendors
- Polish UI/UX based on real usage friction observed in the pilot

---

## Part C — Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Vendors won't adopt due to setup friction | Keep vendor onboarding to <5 minutes; default slot templates; phase 6 pilot specifically tests this before wider rollout |
| Customers resist prepayment | ADR-002 kept behind an abstraction; Option C (deposit) as fallback |
| No-shows even with prepayment (order made, never collected) | Grace period → auto-transition to `No-show`; track rate during pilot to see if it's actually a problem worth solving further |
| Solo developer bandwidth | Phased plan with hard exit criteria per phase — no phase starts before the previous one's criterion is met, preventing scope creep |
| Payment webhook reliability | Idempotent webhook handling designed in from the start (Backend Schema, System Design) rather than retrofitted |
