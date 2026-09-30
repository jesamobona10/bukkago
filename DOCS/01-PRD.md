# Product Requirements Document (PRD)
## Food Booking System

**Status:** Draft — pending field research validation
**Owner:** Jesam Obona

---

## 1. Overview

A multi-vendor food pre-ordering and scheduled-pickup platform for street bukkas, eateries, and small restaurants. Customers order and pay ahead from their phone and collect a ready package at an agreed time — no physical queueing. Delivery is explicitly out of scope; this is a pickup-only model.

## 2. Problem Statement

Street bukkas in high-traffic areas experience severe overcrowding during peak hours. Customers physically queue — pushing, jostling, sometimes spilling into the road — while waiting to order and collect food. Because physical space and vendor serving speed are limited, some customers give up and leave without buying. This is lost revenue for the vendor and a poor, occasionally unsafe, experience for the customer.

**Hypothesis:** If customers can order and pay ahead of time, and simply arrive to collect a ready package, the physical queue shrinks, walk-aways drop, and vendors capture sales they currently lose.

*This hypothesis is currently being validated through vendor interviews, customer interviews, and an online survey (see research brief). Findings from that research should update this PRD before scope is finalized.*

## 3. Goals

| Goal | Success Metric |
|---|---|
| Reduce customer walk-aways at peak hours | % reduction in observed walk-aways at pilot vendor(s) |
| Increase vendor revenue capture | % increase in orders served during peak windows |
| Deliver a genuinely seamless pickup experience | Time from arrival to food-in-hand at pickup < 2 minutes |
| Achieve vendor trust and adoption | ≥1 pilot vendor using it daily for 2+ weeks without reverting to walk-in-only |

## 4. Target Users / Personas

**Customer — "The Class-to-Queue Student/Worker"**
Time-constrained, buys food regularly from the same 2–3 spots, owns a smartphone, moderately price-sensitive, hates standing in a crowded line more than they mind planning slightly ahead.

**Vendor — "The Bukka Owner"**
Runs a small, often single-location food business. Cooks a variable, day-to-day menu (not a fixed catalog). Hands are busy during service. May or may not personally use a smartphone for the business — a delegate (staff/family member) may operate the account. Thin margins; commission-sensitive. Motivated primarily by not losing sales they're currently losing.

**Admin — "The Platform Operator"** (Jesam, initially)
Onboards vendors, monitors platform health, resolves disputes, manages the vendor approval pipeline.

## 5. Scope

### In Scope (v1)
- Multi-vendor listing and discovery
- Customer: browse vendor's currently available items, build an order, choose a pickup window, pay, receive a pickup code, track order status live
- Vendor: receive incoming orders, accept/reject, mark items sold out, update order status, verify pickup
- Order lifecycle: `Pending → Accepted → Preparing → Ready → Collected` (+ `Rejected`, `Cancelled`, `No-show`)
- Admin: vendor onboarding/approval, basic platform oversight

### Out of Scope (v1)
- Delivery, riders, GPS/live tracking
- Table reservations / dine-in seating
- Loyalty programs, subscriptions, recurring orders
- Fixed permanent menu/catalog assumptions — the model must tolerate a menu that changes daily and sells out mid-day

## 6. User Stories (MoSCoW)

### Must Have
- As a customer, I can browse vendors and see what's currently available and its price
- As a customer, I can build an order from a single vendor and select a pickup time
- As a customer, I can pay for my order (method TBD — see ADR-002 in Implementation Plan)
- As a customer, I receive a pickup code/reference after ordering
- As a customer, I can see my order's live status
- As a vendor, I receive new orders in real time and can accept or reject them
- As a vendor, I can mark a menu item as sold out at any time
- As a vendor, I can update an order's status (Preparing → Ready)
- As a vendor, I can verify a customer's pickup code and mark the order Collected
- As an admin, I can approve or reject new vendor applications

### Should Have
- As a customer, I can view past orders and reorder quickly
- As a customer, I receive a notification when my order is Ready
- As a customer, I can cancel within a defined window
- As a vendor, I can see a daily summary of orders and revenue

### Could Have
- As a customer, I can save favorite vendors
- As a vendor, I can set recurring daily availability templates
- Loyalty/points system

### Won't Have (v1)
- Delivery or courier integration
- In-app chat between customer and vendor
- Multi-language support beyond English

## 7. Non-Functional Requirements (summary — see TRD for detail)
- Must tolerate poor/intermittent network conditions
- Must prevent duplicate order submission (idempotency)
- Must handle concurrent orders against limited stock without overselling
- No card data ever stored directly — processed via a licensed payment processor
- Mobile-first, installable as a PWA

## 8. Open Questions (to be resolved by research — see Implementation Plan ADRs)
- Fixed pickup time slots with capacity, vs. free-form "ready by" time
- Prepay in full, deposit, or pay-on-pickup
- Commission/revenue model vendors will tolerate
- Whether the vendor or a delegate primarily operates the vendor account

## 9. Assumptions
- At least one pilot vendor will agree to a live trial
- Customers already own smartphones with data access (validated further by survey)
- Nigerian payment processors (Paystack/Flutterwave) are sufficient for payment needs

## 10. Release Strategy
A single-vendor pilot precedes multi-vendor rollout. See Implementation Plan for phased breakdown.
