# Architecture

How the Jett Barbecue ordering and dispatch prototype works: the data model, the rules that protect
it, the route optimiser and where AI is (and isn't) used. Visual design is in [DESIGN.md](DESIGN.md).

## 1. Context

Jett Barbecue sells Texas-style smoked beef ribs in Singapore, delivery only. The business has two
hard limits and one busy season:

- **Smoker capacity.** Ribs are smoked per day, so each delivery slot can only sell so many.
- **No in-house drivers.** Each evening Jett books temporary Grab drivers and loads cars by hand.
- **Christmas.** The founder's Dec 2025 export has 2,005 orders. 99% were placed at least two days
  ahead, so routes can be planned the night before. Real-time dispatch isn't needed. The peak was
  24 Dec 2025, 5:00–6:30 PM: 97 orders in one slot.

The prototype covers three areas:

| Area | Who | Routes |
|---|---|---|
| Customer site | Customers, mostly on phones | `/`, `/order`, `/checkout`, `/track/[token]` |
| Back office | The founder / ops staff | `/admin` (overview), `/admin/orders`, `/admin/slots`, `/admin/settings`, `/admin/insights` |
| Dispatch | Dispatcher and drivers | `/admin/dispatch`, `/run/[token]` (driver page, no login) |

## 2. System overview

```
 Browser ──► Next.js 16 on Vercel (sin1)
              ├─ Server Components / Server Actions ──► Supabase Postgres (Singapore)
              │     (all business rules run in Postgres     ├─ RLS on every table
              │      functions or on the server)            ├─ security-definer RPCs for public access
              │                                             └─ Realtime: delivery_runs, run_stops
              ├─ lib/routing (pure TypeScript optimiser)
              └─ lib/ai ──► OpenAI Responses API (server-side only)
 OneMap ◄── postal code lookup (checkout) and basemap tiles (dispatch map)
```

| Decision | Choice | Why |
|---|---|---|
| Hosting | Vercel `sin1` + Supabase `ap-southeast-1` | Both in Singapore, next to the customers. |
| Rendering | Next.js App Router with Cache Components | Server Components keep data access and secrets on the server. |
| UI | Tailwind CSS 4 + shadcn/ui, customised through tokens | Two themes (shop, ops) from one component set; see DESIGN.md §9. |
| Map | Leaflet + OneMap Grey tiles | Singapore's official basemap; OneMap also geocodes postal codes. |
| Payment | Demo "Pay" button | The order is marked paid; no gateway is connected. |
| Time | `timestamptz` in UTC; business timezone in `lib/config.ts` only | Slots and business dates are computed in `Asia/Singapore`. |
| Money | `numeric(10,2)` in Postgres; integer cents or decimal strings in code | Never floating point. Prices are stored before GST; GST (9%) is added on the server. |

## 3. Data model

```
settings         single row: depot (kitchen) name/address/lat/lng, vehicle_capacity_units,
                 service_minutes_per_stop, avg_speed_kmh, road_factor, gst_rate,
                 free_delivery_threshold, fee_base, fee_per_km

menu_items       slug, name, description, category, price (before GST), image_path, serves,
                 rib_units (smoker capacity used), load_units (car space used),
                 available_from / available_to (seasonal), is_active, sort_order

delivery_slots   service_date (business date), window_start, window_end, rib_capacity,
                 ribs_booked (maintained under a row lock), is_open
                 UNIQUE (service_date, window_start)

postal_codes     postal_code PK, lat, lng, formatted_address        -- geocode cache

orders           code (JB100001…), slot_id, source (web | import), status, customer and address
                 fields, lat/lng, notes, driver_note, subtotal, delivery_fee, gst, total,
                 payment_status, payment_method, tracking_token, idempotency_key,
                 is_zero_value (generated: total = 0), created_at
                 INDEX (slot_id, status), INDEX (created_at desc, id desc)

order_items      order_id, menu_item_id, name_snapshot, unit_price, qty, line_total,
                 rib_units (snapshot, so cancelling releases exactly what was reserved)

delivery_runs    slot_id, run_number, status, color, driver_name / phone / vehicle_plate,
                 driver_token, planned_departure, total_km, est_duration_min

run_stops        run_id, order_id (UNIQUE), sequence, eta, leg_km, status, failure_reason,
                 delivered_at                          INDEX (run_id, sequence)

ai_insights      kind, key, payload jsonb, created_at  -- cached AI briefings, UNIQUE (kind, key)
```

- **Order status:** `confirmed → planned → out_for_delivery → delivered`, plus `failed` and `cancelled`.
- **Run status:** `planned → assigned` (driver named) `→ in_progress → completed`.

A **run** is one car trip from the kitchen. The kitchen location and car capacity are placeholders
(10 Beef Rib Set boxes per car) until confirmed. Both can be edited in Settings.

## 4. Integrity and security

Business rules live in Postgres functions, so the browser can't skip them. Migrations are in
`supabase/migrations/`.

**Ordering**

- `place_order` is the only way to create an order. It locks the slot row (`FOR UPDATE`) and then:
  - checks the lead time: 24 hours, or 3 days for Christmas items;
  - checks seasonal availability;
  - checks the remaining rib capacity;
  - reads prices from `menu_items`, then computes the delivery fee and GST.

  Two customers can't both take the last ribs. Nothing price-related is trusted from the browser.
- **Idempotent checkout.** The browser sends an `idempotency_key`. A retried or double-clicked Pay
  returns the original order, never a duplicate.
- **Delivery fee.** Delivery is free from $195 (subtotal before GST). Below that, the fee is a base
  amount plus a per-km charge on the road-adjusted distance from the kitchen.
- **Cancelling.** `admin_cancel_order` releases the order's snapshotted ribs and marks a paid order
  refunded. Only `confirmed` or `planned` orders can be cancelled.

**Access**

| Who | Can do | How |
|---|---|---|
| Public | Read the active menu | RLS policy on `menu_items` (`is_active` rows only) |
| Public | See bookable slots, quote delivery, place an order | `get_bookable_slots` (remaining ribs only, not capacity or bookings), `quote_delivery`, `place_order` |
| Customer | See their order | `get_order_by_token`: the unguessable tracking token is the receipt |
| Driver | See their run, start it, mark stops | `get_run`, `start_run`, `mark_stop`, keyed by the run's unguessable `driver_token` |
| Admin | Everything | RLS `is_admin()`: `app_metadata.role = 'admin'`, which only the secret key can set |

- Public sign-ups are disabled in Supabase Auth.
- `proxy.ts` refreshes the admin session and redirects signed-out visitors, but it isn't the
  security check. Every admin page and Server Action calls `requireAdmin()` itself.
- All other tables have RLS with no public policy. Public functions are `security definer` with an
  empty `search_path` and explicit `grant execute`.
- The planned routes lock as soon as any run in the slot starts, so a dispatcher can't re-plan
  under a driver who is already on the road.

## 5. Route optimiser (`lib/routing/optimise.ts`)

The optimiser is pure, deterministic TypeScript: no I/O, no clock, no randomness. The same orders
and settings always produce the same plan.

- **Input:** kitchen location, stops (location, load, optional deadline), car capacity, the slot's
  time window, service minutes per stop, average speed, road factor, and the dispatcher's rules.
- **Output:** runs with stop sequence, ETAs, km, departure time, and warnings.

1. **Distance.** Straight-line (haversine) distance × road factor (default 1.4). Travel time
   comes from the average urban speed.
2. **Clustering (sweep).**
   - Stops are sorted by angle around the kitchen.
   - Stops fill a run until the car is full, or until a stop would arrive after the window ends.
   - The sweep is tried from many starting angles. The plan kept has the fewest late stops, then
     the fewest cars, then the fewest km.
3. **Sequencing.** Each run is ordered nearest-neighbour first, then improved with 2-opt. Late
   arrivals are penalised heavily.
4. **Timing.** The car leaves so that it reaches its first stop at the window start. Routes are
   open: the driver doesn't return to the kitchen.
5. **Baseline.** For comparison, a "manual" baseline fills cars in order-code sequence, unsorted,
   and only starts a new car when the current one is full. It reports lateness but doesn't avoid
   it.
6. **Manual moves.** When the dispatcher moves a stop to another run, each run keeps its stops and
   is re-sequenced under the same rules. Broken rules come back as warnings rather than being
   silently undone.

**Dispatcher rules** (also the AI copilot's output schema, validated with zod in
`lib/dispatch-rules.ts`):

- deadline per order
- first stop
- last stop
- keep orders in the same run
- keep orders in separate runs
- maximum number of cars
- car capacity override

On the 24 Dec 2025 peak slot (97 orders) with the default settings:

| Plan | Cars | Distance | Late stops |
|---|---|---|---|
| Optimised | 20 | about 321 km | 0 |
| Baseline | 19 | about 1,264 km | 38 |

The optimiser uses one more car than the baseline, but every stop is on time and the cars drive
about three-quarters less.

## 6. AI features (`lib/ai/`)

The principle is that **AI translates and explains; deterministic code plans and counts.** Every
number shown comes from the optimiser or from SQL, never from the model.

| Feature | Flow |
|---|---|
| **Dispatch copilot** | 1. The dispatcher types an instruction ("Cars can fit 12 boxes today", "The Panorama order in Ang Mo Kio must arrive by 5:10 PM"). 2. The model returns rules as strict Structured Outputs. 3. The rules are validated again with zod. 4. The optimiser re-plans. 5. The model writes a short summary using only the resulting metrics. 6. Rules show as chips, with Undo and Clear. |
| **Forecast briefing** | 1. SQL aggregates Dec 2025 demand by day, window and area. 2. The optimiser re-plans last year's peak slots, and again with the assumed growth added as extra orders. 3. The model writes a short briefing for the founder from those numbers. 4. The briefing is cached in `ai_insights`, keyed on the numbers that shape the plan. Briefings that haven't been rewritten in 90 days are deleted. |

Guardrails:

- **Server-side only.** OpenAI calls run on the server; the key never reaches the browser.
- **Explicit timeouts.** Each call has a timeout of 20–45 s, depending on the call.
- **Untrusted output.** Model output is treated as untrusted input. It's parsed, validated, and
  discarded if invalid. Refusals, timeouts and invalid output are reported to the user as errors.
- **Privacy.** The copilot never receives customer names, phone numbers or emails. It only gets
  order codes, postal codes and street names.
- **Model.** The model is configured with `OPENAI_MODEL`.

## 7. Live updates

`delivery_runs` and `run_stops` are published to Supabase Realtime. The dispatch board subscribes
to them, so when a driver starts a run or marks a stop, the dispatcher's map and run cards update
without a reload.

## 8. Scale considerations

- **Orders list.** Keyset (cursor) pagination on `(created_at, id)`, served by the matching index.
  Page cost doesn't grow with how deep the user pages. The total shown is an exact filtered count,
  which is cheap at this volume (thousands of orders a season). It should switch to an estimated
  count if orders reach millions.
- **Bounded queries.** Every list is bounded: 50 orders per page, at most 31 days of slots, and
  one slot per dispatch plan.
- **Geocoding.** Postal codes are geocoded once and cached in `postal_codes`, so checkout and
  dispatch don't call OneMap per order.

## 9. Data import

`npm run data:seed` (`scripts/seed.ts`) loads the menu, delivery slots, the geocode cache, the demo
admin user and the Dec 2025 orders. It's idempotent: re-running skips rows that already exist.

- **Order export.** The founder's anonymised export goes in `data/` and isn't committed. Orders are
  imported with `source = 'import'`:
  - Fully refunded orders become `cancelled`, leaving 1,995 active orders.
  - The "How to order for Christmas!" line items are dropped. They were an instruction listing
    that customers could add to the cart on the old site.
  - The eight $0 orders are kept and flagged by `is_zero_value`.
- **Addresses.** Duplicated ", Singapore <postal>" suffixes and placeholder second lines ("0",
  "-") are cleaned on import.
- **Seed data.** The menu comes from Jett's current ordering site, with prices stored before GST
  (`scripts/seed-data.ts`). Slots cover Dec 2025 (historical, for replaying the peak) and
  27 Nov 2026 – 3 Jan 2027 (bookable).

## 10. Testing

```bash
npm test          # node --test: route optimiser and dispatcher rules (23 tests)
npm run typecheck
npm run lint
```

- **Optimiser tests** cover capacity, time windows, every dispatcher rule (including what happens
  when a rule can't be met), the baseline, and re-sequencing after manual moves.
- **Rule tests** cover validating AI output, mapping order codes to orders, and converting
  Singapore wall-clock deadlines to UTC.

## 11. Known limitations and next steps

- **Distances.** Distances are straight-line × road factor. The next step is road travel times
  (OSRM, or the Google Route Optimization API).
- **Placeholders.** The kitchen location and car capacity stay placeholders until the founder
  confirms them.
- **Payments.** Payments are a demo. A real gateway would add webhook-confirmed payment states.
  Checkout is already idempotent, so a retried payment can't create a second order.
- **Links.** Driver and tracking links don't expire yet.
- **Not built:**
  - a "How much should I order?" helper (headcount → suggested basket);
  - AI clean-up of unclear addresses and delivery notes.
