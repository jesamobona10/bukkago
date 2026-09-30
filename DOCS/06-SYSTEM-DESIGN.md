# System Design
## Food Booking System

*Follows a standard requirements → high-level design → deep dive → scale/reliability → trade-offs structure.*

---

## 1. Requirements Recap

**Functional:** multi-vendor discovery, live-availability ordering, scheduled pickup, real-time order status, pickup verification, vendor and admin management. Full detail in PRD.

**Non-functional:** tolerant of poor networks, no overselling under concurrency, no card data touching the app database, mobile-first, low operational overhead for a solo developer. Full detail in TRD.

**Constraints:** single developer, no hard deadline but bias toward shipping a working single-vendor pilot quickly, budget-conscious (avoid infra that costs money before there's revenue or proven demand).

## 2. High-Level Design

### Component Diagram
```
                          ┌─────────────────────────┐
                          │   Next.js App (Vercel)   │
                          │  ┌───────────────────┐  │
                          │  │ Customer PWA (SPA) │  │
                          │  ├───────────────────┤  │
                          │  │ Vendor Dashboard    │  │
                          │  ├───────────────────┤  │
                          │  │ Admin Panel         │  │
                          │  └───────────────────┘  │
                          │  ┌───────────────────┐  │
                          │  │ Route Handlers/API  │  │
                          │  └─────────┬─────────┘  │
                          └────────────┼────────────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
        ┌──────────────┐     ┌─────────────────┐   ┌──────────────────┐
        │   Supabase    │     │ Supabase Realtime│   │  Supabase Storage │
        │ Postgres + Auth│     │ (order/status ch.)│   │  (photos, logos)  │
        │  + RLS + RPC   │     └─────────────────┘   └──────────────────┘
        └──────┬────────┘
               │
     ┌─────────┴──────────┐
     ▼                    ▼
┌───────────┐     ┌──────────────────┐
│ Paystack/ │     │  SMS Provider     │
│Flutterwave│     │ (Termii/AT)       │
│ (webhooks)│     └──────────────────┘
└───────────┘
```

### Data Flow — Order Placement (happy path)
1. Customer submits cart + pickup slot + idempotency key from the client
2. API route handler validates the request shape, then calls the `place_order` Postgres RPC (server-side, using the user's authenticated Supabase session — RLS applies)
3. RPC atomically: checks idempotency, locks and decrements stock, reserves slot capacity, creates the order + order_items, returns `order_id`
4. Route handler initiates a payment intent with Paystack/Flutterwave, returns a payment URL/reference to the client
5. Customer completes payment on the processor's hosted flow
6. Processor sends a webhook to a dedicated route handler → verifies signature → updates `payments` and `orders.payment_status` via the service-role client
7. Supabase Realtime pushes the updated order to both the customer's and vendor's subscribed channels

### API Contracts (representative — expand during implementation)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/vendors` | GET | Public | List active vendors |
| `/api/vendors/[id]/menu` | GET | Public | Available menu items for a vendor |
| `/api/vendors/[id]/slots` | GET | Public | Available pickup slots for a vendor/date |
| `/api/orders` | POST | Customer | Place an order (calls `place_order` RPC) |
| `/api/orders/[id]` | GET | Customer/Vendor/Admin | Order detail (RLS-scoped) |
| `/api/orders/[id]/status` | PATCH | Vendor | Advance order status |
| `/api/orders/[id]/verify-pickup` | POST | Vendor | Verify pickup code, mark Collected |
| `/api/payments/webhook` | POST | Processor (signature-verified) | Payment confirmation |
| `/api/vendor/menu-items` | POST/PATCH | Vendor | Manage today's items/availability |
| `/api/admin/vendors/[id]/approve` | POST | Admin | Approve pending vendor |

### Storage Choices
- **Postgres (Supabase)** for all relational/transactional data — orders, menu, vendors, payments
- **Supabase Storage** for images (vendor logos, item photos) — not stored in the database itself
- **No separate cache layer at v1** — Postgres + Supabase Realtime is sufficient at expected v1 volumes; revisit if read load on vendor discovery grows significantly (see §4)

## 3. Deep Dive

### Data Model
See **Backend Schema** document for full DDL. Key relationships: `vendors` 1—N `menu_items`, `vendors` 1—N `pickup_slots`, `orders` N—1 `customers`/`vendors`/`pickup_slots`, `orders` 1—N `order_items`, `orders` 1—N `payments`.

### Caching Strategy
- Client-side: PWA service worker caches vendor list and menu data for offline browsing; cache invalidated on Realtime update or on next successful fetch
- Server-side: none required at v1 scale — Postgres read performance is more than sufficient for dozens of vendors and low-thousands of daily orders

### Queue / Event Design
- No dedicated message queue at v1 — Supabase Realtime (Postgres logical replication under the hood) serves as the event mechanism for status changes
- Payment webhooks are the one place an external event enters the system; handled synchronously in a route handler with idempotent processing (check `provider_reference` uniqueness before applying)

### Error Handling & Retry
- Client retries order submission using the same idempotency key on network failure — safe by design (see `place_order` RPC)
- Payment webhook handler is idempotent — reprocessing the same webhook (which processors do on non-200 responses) must not double-apply a payment
- Stock/slot conflicts surface as explicit, user-readable errors (`ITEM_UNAVAILABLE`, `PICKUP_SLOT_FULL`) rather than generic failures, so the UI can respond meaningfully

## 4. Scale and Reliability

**Load estimate (v1 target):** a handful of pilot vendors, dozens to low-hundreds of orders/day total. This is comfortably within Supabase's free/starter tier and standard Postgres performance — no horizontal scaling design needed yet.

**What would need revisiting as it grows:**
- **Realtime channel fan-out** — if vendor count grows into the hundreds with many simultaneous customers watching order status, revisit channel scoping/batching
- **Read load on vendor discovery** — if listing/browsing traffic significantly exceeds order-writing traffic, introduce a read cache (e.g. Vercel Edge caching on the vendor list endpoint) before reaching for a dedicated cache layer
- **Payment webhook throughput** — currently synchronous; if volume grows, move to a queue-backed async handler to avoid blocking on processor response times
- **Single Postgres instance** — fine at this scale; Supabase supports read replicas if/when needed, no design changes required to adopt later

**Failover/redundancy:** relies on Supabase's and Vercel's managed infrastructure guarantees at this stage — not building custom redundancy for v1. This is an explicit, deliberate trade-off given team size (see §5).

**Monitoring:** structured logging via the existing `logApiError`/`logSecurityEvent` pattern (proven in the VUNA project), routed to console at v1; graduate to a hosted log drain once there's a paying/live user base worth alerting on.

## 5. Trade-off Analysis

| Decision | Trade-off |
|---|---|
| Monolith (Next.js route handlers) over microservices | Faster to build and reason about solo; harder to scale individual pieces independently later — acceptable, this isn't a v1 concern |
| Supabase Realtime over a dedicated message queue (Kafka/SQS) | Zero extra infra to run/pay for; less fine-grained control over delivery guarantees — acceptable at this volume |
| Synchronous webhook handling over async queue | Simpler to implement and debug; a slow processor response blocks the handler briefly — acceptable at v1 volume, revisit if it becomes noticeable |
| No dedicated cache layer | One less moving part to operate; read performance depends entirely on Postgres/Vercel edge — acceptable until discovery traffic significantly outpaces write traffic |
| PWA over native app | Ships faster, one codebase; no app-store presence, and push notification reliability is weaker than native — acceptable for validating vendor/customer adoption before investing in native |

## 6. What This Design Deliberately Does Not Solve Yet
- Delivery/logistics (explicitly out of scope per PRD)
- Multi-region/multi-currency support
- High-availability failover beyond what Supabase/Vercel provide by default
- Advanced fraud detection on payments — relying on the processor's built-in protections at v1
