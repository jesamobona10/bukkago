# UI/UX Design Brief
## Food Booking System

---

## 1. Design Principles

1. **Speed over decoration.** Every screen should get the user to their next action in as few taps as possible — especially for vendors mid-service.
2. **Design for busy hands and bad networks.** Large tap targets, minimal typing, works acceptably on 3G.
3. **Status should never be ambiguous.** A customer or vendor should always be able to tell, at a glance, exactly what state an order is in.
4. **Trust is earned through clarity, not decoration.** Especially for vendors new to digital tools — clear labels over clever icons, plain language over jargon.
5. **Mobile-first, one-handed usable.** Assume the primary device is a phone held in one hand, possibly while doing something else.

## 2. Information Architecture

### Customer App
```
Home (vendor discovery)
 ├─ Vendor list (open/closed, distance/area, prep time)
 └─ Vendor detail
     ├─ Available items
     ├─ Cart
     ├─ Pickup time selection
     ├─ Checkout / Payment
     └─ Order confirmation (code + status)
Orders (history)
 └─ Order detail (live status)
Profile
 └─ Payment methods, saved info
```

### Vendor Dashboard
```
Today's Board (default landing screen — this is the operational hub)
 ├─ Incoming orders queue (real-time)
 ├─ In-progress orders (Accepted/Preparing)
 ├─ Ready for pickup
 └─ Quick "mark sold out" controls
Menu / Availability
 └─ Toggle items, set quantities
Orders (history)
Summary / Reports
 └─ Daily order count, revenue
```

### Admin Panel
```
Vendor Applications (pending queue)
Vendors (active list)
Orders (platform-wide, read-only oversight)
Disputes/Refunds
```

## 3. Key Screens — Design Notes

### Customer: Vendor Detail / Menu
- Items shown with price, short description, and availability state clearly visible (not just implied by absence)
- Sold-out items stay visible but visually muted, not hidden — customers should understand *why* an item isn't orderable, not wonder if the app is broken

### Customer: Checkout
- Pickup time selection should be the most prominent element on this screen — it's the core value proposition
- Total cost shown persistently, not just at the final step
- Payment method selection kept to one clear primary action

### Customer: Order Confirmation / Status
- Pickup code should be large, high-contrast, easy to read at a glance or show to someone else
- Status shown as a simple linear progress indicator (Pending → Accepted → Preparing → Ready), not a complex timeline
- A one-tap "show pickup code" state that works even with a weak/no connection (cache the code locally after confirmation)

### Vendor: Today's Board
- This is the screen a vendor will have open all day — treat it like a dashboard, not a settings page
- New orders should be visually and audibly distinct (sound/vibration cue) since the vendor won't be staring at the screen constantly
- Large, thumb-friendly Accept/Reject and status-advance buttons — designed for quick taps between cooking tasks
- Sold-out toggle should be reachable in one tap from this screen, not buried in a menu settings page

### Vendor: Pickup Verification
- Numeric code entry should be a simple, large numpad-style input, not a general text field
- Immediate, unmistakable success/failure feedback (color + icon + sound), since this happens face-to-face with a customer waiting

## 4. Visual Design Direction

- **Mood:** warm, food-appropriate, trustworthy, unfussy — closer to a well-run community service than a slick VC-funded delivery app
- **Color:** a warm primary (amber/orange family reads as food-appropriate and locally familiar) with a clear, high-contrast status system (green = ready/success, amber = in progress, red = issue/rejected)
- **Typography:** highly legible at small sizes and in bright outdoor light — avoid thin/light font weights as primary body text
- **Iconography:** used to reinforce text labels, never to replace them — vendors and customers new to the app shouldn't have to learn an icon language

## 5. Accessibility & Constraints

- Minimum tap target size 44×44px, generous spacing between destructive and non-destructive actions (e.g. Reject vs. Accept should not be adjacent without clear separation)
- Color is never the *only* signal for status — always paired with text/icon
- All critical flows (checkout, pickup verification) must remain usable at low connectivity — design explicit loading/retry/offline states rather than letting screens hang silently
- Text should be legible outdoors in direct sunlight (sufficient contrast ratios, avoid low-contrast grey-on-white for anything critical)

## 6. Interaction Patterns

- **Real-time updates** should animate subtly (not jarringly) when status changes while a screen is open
- **Destructive actions** (reject order, cancel) always require a one-tap confirmation with a visible reason field where relevant
- **Empty states** (no orders yet, no vendors nearby) should explain what to do next, not just show blank space

## 7. Deliverables for Design Phase
- Low-fidelity wireframes: customer discovery → checkout → confirmation flow
- Low-fidelity wireframes: vendor Today's Board + pickup verification
- Component library basics: buttons, status badges, cards, numeric input, toast/alert patterns
- One high-fidelity screen per role to lock the visual direction before building the rest
