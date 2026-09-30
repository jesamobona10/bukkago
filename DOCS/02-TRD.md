# Technical Requirements Document (TRD)
## Food Booking System

**Status:** Draft
**Companion to:** PRD, System Design, Backend Schema

---

## 1. Purpose
Translates the PRD's functional requirements into concrete technical requirements, constraints, and acceptance criteria for engineering.

## 2. Tech Stack (reference)

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Zustand, PWA |
| Backend | Next.js Route Handlers, TypeScript |
| Database & Auth | Supabase (PostgreSQL), Supabase Auth, Row Level Security |
| Real-time | Supabase Realtime |
| Payments | Paystack (primary), Flutterwave (backup) |
| File Storage | Supabase Storage |
| Notifications | Web Push, SMS fallback (Termii/Africa's Talking) |
| Hosting | Vercel (app), Supabase Cloud (data) |

## 3. Functional Requirements → Technical Requirements

| Functional Requirement | Technical Requirement |
|---|---|
| Customer browses live vendor availability | Menu items table with `is_available` boolean and/or `quantity_remaining`; Realtime subscription so stock changes reflect instantly |
| Customer places an order | Order + order_items created atomically in one transaction; price snapshotted onto order_items at creation time, never referencing live menu price |
| Prevent overselling limited stock | Row-level locking or atomic decrement (`UPDATE ... SET quantity = quantity - 1 WHERE quantity > 0`) at order-confirmation time; reject with clear error if insufficient stock |
| Prevent duplicate order submission | Idempotency key generated client-side per checkout attempt, stored and checked server-side before insert |
| Vendor sees new orders instantly | Supabase Realtime channel scoped to `vendor_id`, subscribed from the vendor dashboard |
| Customer sees live order status | Supabase Realtime channel scoped to `order_id`/`customer_id` |
| Pickup verification | Server-generated short numeric code per order, validated server-side on vendor's "verify pickup" action — never trust a client-side check |
| Payment processing | Server-side payment intent creation via Paystack/Flutterwave SDK; webhook-based confirmation, never trust client-reported "payment succeeded" |
| Role separation (customer/vendor/admin) | Supabase Auth + custom role claim or separate profile tables; enforced via RLS policies, not just UI conditionals |

## 4. Non-Functional Requirements

### Performance
- Menu browsing and cart actions should feel instant (<300ms perceived) on 3G-equivalent connections
- Order submission round-trip target: <2s under normal network conditions

### Reliability
- Order state transitions must be atomic — no order should be left in an ambiguous state if a request fails mid-way
- Payment confirmation must be webhook-driven, not purely client-callback-driven, to survive dropped connections after payment but before app response

### Security
- No raw card data touches the application database at any point — handled entirely by the payment processor
- RLS enabled and enforced on every table containing customer, vendor, or order data
- Admin actions logged (who approved which vendor, who issued a refund, etc.)
- Rate limiting on auth endpoints and order-creation endpoints to prevent abuse

### Scalability (v1 target, not hyperscale)
- Designed to comfortably support dozens of vendors and low-thousands of orders/day without architecture changes
- Realtime channel usage scoped per vendor/customer to avoid unnecessary broadcast load

### Offline / Poor Network Tolerance
- Menu data cached client-side (PWA service worker) so browsing degrades gracefully offline
- Order submission retries safely using the idempotency key rather than creating duplicates
- Clear UI state for "order pending sync" vs. "confirmed"

### Compliance
- Payment handling must go through a PCI-DSS compliant processor (Paystack/Flutterwave) — the platform itself never becomes PCI-scoped
- Customer data handling should follow basic data-minimization principles (collect only what's needed: name, phone, email)

## 5. Integration Requirements

| Integration | Requirement |
|---|---|
| Paystack/Flutterwave | Server-side secret key never exposed to client; webhook signature verification required on every incoming webhook |
| SMS provider (Termii/Africa's Talking) | Used for order-ready and pickup-code fallback when push notification isn't delivered/acknowledged within a threshold |
| Supabase Storage | Vendor logos and menu item photos — enforce file type and size limits (mirrors the existing 2MB/image-type pattern) |

## 6. Environments
- **Local development** — local `.env`, Supabase local dev or a dev project
- **Staging** — separate Supabase project, test payment keys (Paystack/Flutterwave test mode)
- **Production** — production Supabase project, live payment keys, secrets only in Vercel environment variables (never committed)

## 7. Acceptance Criteria (sample — expand per feature during implementation)
- An order cannot be created for an item with `quantity_remaining = 0`
- A vendor cannot see or modify another vendor's orders (verified via RLS test, not just UI test)
- A pickup code can only be marked Collected once; a second verification attempt is rejected
- A failed payment does not create a confirmed order
- A dropped connection immediately after payment does not result in a duplicate charge (idempotency key + webhook reconciliation)

## 8. Constraints
- Single developer (Jesam) — architecture must favor low operational overhead over theoretical scalability
- No hard external deadline, but bias toward shipping a working single-vendor pilot before expanding scope
