# Jett Barbecue — Ordering & Dispatch Prototype

A customer ordering site, back office and route-optimised delivery dispatch for Jett Barbecue, a
Texas-style smoked beef rib caterer in Singapore. It's built around replaying the real Christmas Eve
2025 peak: 97 orders in one evening slot.

**Live demo:** https://jett-barbecue-iota.vercel.app (admin at `/admin`; payments are a demo, no card is charged)

## What it does

| Area | Highlights |
|---|---|
| **Customer site** | Full menu always visible, with seasonal Christmas items. Postal-code address lookup (OneMap). Delivery slots that show remaining rib capacity and can't be oversold. 3-step checkout and a tracking page. |
| **Back office** | Daily overview of orders, smoker capacity and revenue per slot. Orders with search, filters and pagination. Slot capacity and open/closed, business settings, cancellations that release capacity. |
| **Dispatch** | Plans Grab-car runs for a slot (capacity, time window, ETAs), compared with filling cars in order sequence. Map with colour-coded routes; move stops between runs. Driver link (no login) with navigation, call and delivered / can't-deliver updates in real time. |
| **AI** | A copilot that turns plain-English dispatcher instructions into validated routing rules. A forecast briefing for next Christmas, written from computed numbers. The AI never produces the numbers itself. |

On the 24 Dec 2025 peak slot, the optimiser plans **20 cars, about 321 km, every stop on time**.
Filling cars in order sequence needs **19 cars, about 1,264 km, with 38 late stops**.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data model, integrity and security rules, the route
  optimiser, AI guardrails, scale notes, testing and known limitations
- [docs/DESIGN.md](docs/DESIGN.md): the visual design system (tokens, typography, layouts, components)

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · Tailwind CSS 4 · shadcn/ui (Radix) ·
Supabase (Postgres, Auth, Realtime) · Leaflet + OneMap · OpenAI · Vercel (`sin1`, Singapore)

## Setup

Requires Node.js ≥ 22.18 (scripts run TypeScript directly).

1. Install packages:
   ```bash
   npm install
   ```
2. Create a Supabase project in **Southeast Asia (Singapore)**. In *Authentication → Sign In /
   Providers*, turn **off** "Allow new users to sign up".
3. Copy `.env.example` to `.env.local`. Fill in the Supabase URL and keys, a demo admin email and
   password, and an OpenAI key (only the AI features need it).
4. Apply the database schema (one-time `login` and `link`):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```
5. Put the founder's anonymised order export at `data/orders-dec2025-anonymised.csv`. It isn't in
   the repository because it contains real delivery addresses.
6. Load the menu, delivery slots, geocodes, the admin user and the Dec 2025 orders:
   ```bash
   npm run data:seed
   ```
   Add `-- --dry-run` to check the data without writing anything.
7. Start the app:
   ```bash
   npm run dev
   ```
   Customer site: http://localhost:3000 · Admin: http://localhost:3000/admin

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server. |
| `npm test` | Unit tests for the route optimiser and dispatcher rules (`node --test`). |
| `npm run typecheck` / `lint` | TypeScript and ESLint. |
| `npm run db:push` | Applies `supabase/migrations/` to the linked project. |
| `npm run data:seed` | Seeds Supabase. Idempotent: re-running skips rows that already exist. |
| `npm run data:geocode` | Looks up each postal code in the export via OneMap and caches the results in `data/postal-codes.json` (committed; only re-run for new data). |
| `npm run data:images -- "<photos folder>"` | Converts the original photos into web-sized WebP files in `public/images/` (already done). |
| `npm run demo:reset` | Deletes delivery runs on Dec 2025 slots and sets those imported orders back to Confirmed, so the replay starts unplanned. Add `-- --dry-run` to count only. |

## Deploy (Vercel, Singapore)

`vercel.json` pins functions to `sin1`, next to the Supabase project. `.vercelignore` keeps `.env*`
files and the seed data out of the upload.

1. Log in and link this folder to a Vercel project (one-time):
   ```bash
   npx vercel login
   npx vercel link
   ```
2. In the Vercel dashboard → the project → *Settings → Environment Variables*, add these for
   **Production**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`

   `SEED_*` are only for local scripts. `NEXT_PUBLIC_*` values are baked in at build time, so
   redeploy after changing them.
3. Deploy:
   ```bash
   npx vercel deploy --prod
   ```

## Project layout

```
app/(shop)/          customer site: home, order, checkout, tracking (theme-shop root layout)
app/(ops)/admin/     back office: overview, orders, slots, dispatch, insights, settings (theme-ops)
app/(ops)/run/       driver page, opened from a per-run link
components/ui/       shadcn/ui components (restyled through tokens)
components/shop/     customer-site components (header, cart, menu cards, …)
components/ops/      back-office components (sidebar, page header, day navigation, …)
lib/routing/         route optimiser (pure TypeScript, unit-tested)
lib/ai/              OpenAI client, dispatch copilot, forecast briefing
lib/supabase/        Supabase clients (browser, server session, secret key)
lib/                 shared logic: admin and dispatch data, insights, formatting, time, config
scripts/             data scripts (geocode, images, seed, demo reset)
supabase/migrations/ schema, RLS policies and Postgres functions
docs/                architecture and design system
```

## Conventions

- **Time.** The business timezone lives only in `lib/config.ts` (`Asia/Singapore`). Timestamps are
  stored in UTC.
- **Money.** `numeric(10,2)` in Postgres; integer cents or decimal strings in code, never floats.
- **Business rules.** Rules such as capacity, prices, lead time and cancellation run in Postgres
  functions, not in the browser.
- **Admin access.** It requires `app_metadata.role = "admin"`, which only the seed script (secret
  key) can set. Every admin page and action checks it with `requireAdmin()`.
