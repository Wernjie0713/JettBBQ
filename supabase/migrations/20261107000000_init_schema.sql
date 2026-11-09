-- Jett Barbecue prototype: core schema. Design notes: docs/ARCHITECTURE.md §3.
-- Money: numeric(10,2). Absolute times: timestamptz (UTC). Business dates: date in Asia/Singapore.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.menu_category as enum ('set', 'christmas', 'extra', 'side');
create type public.order_source as enum ('web', 'import');
create type public.order_status as enum (
  'confirmed', 'planned', 'out_for_delivery', 'delivered', 'failed', 'cancelled'
);
create type public.payment_status as enum ('paid', 'unpaid', 'refunded', 'partially_refunded');
create type public.run_status as enum ('planned', 'assigned', 'in_progress', 'completed');
create type public.stop_status as enum ('pending', 'delivered', 'failed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Admin = user whose app_metadata.role is 'admin'. app_metadata can only be set with the
-- secret key, so this stays safe even if public sign-ups were accidentally enabled.
create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create function public.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create sequence public.order_code_seq start with 100001;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Single-row operational settings. Depot values are placeholders until the founder confirms.
create table public.settings (
  id boolean primary key default true check (id),
  depot_name text not null default 'Placeholder kitchen (update in Settings)',
  depot_address text,
  depot_lat numeric(9, 6) not null default 1.352100,
  depot_lng numeric(9, 6) not null default 103.819800,
  vehicle_capacity_units numeric(6, 2) not null default 10 check (vehicle_capacity_units > 0),
  service_minutes_per_stop integer not null default 6 check (service_minutes_per_stop between 0 and 60),
  avg_speed_kmh numeric(5, 2) not null default 30 check (avg_speed_kmh > 0),
  road_factor numeric(4, 2) not null default 1.40 check (road_factor >= 1),
  gst_rate numeric(5, 4) not null default 0.0900 check (gst_rate between 0 and 1),
  free_delivery_threshold numeric(10, 2) not null default 195.00 check (free_delivery_threshold >= 0),
  fee_base numeric(10, 2) not null default 10.00 check (fee_base >= 0),
  fee_per_km numeric(10, 2) not null default 1.00 check (fee_per_km >= 0),
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) <= 120),
  description text check (char_length(description) <= 1000),
  category public.menu_category not null,
  price numeric(10, 2) not null check (price >= 0), -- before GST
  image_path text,
  serves text,
  rib_units integer not null default 0 check (rib_units >= 0),           -- daily smoker capacity
  load_units numeric(5, 2) not null default 0 check (load_units >= 0),   -- vehicle space
  available_from date,
  available_to date,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (available_to is null or available_from is null or available_to >= available_from)
);

create table public.delivery_slots (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  rib_capacity integer not null check (rib_capacity >= 0),
  ribs_booked integer not null default 0 check (ribs_booked >= 0), -- maintained under row lock by order functions
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  unique (service_date, window_start),
  check (window_end > window_start)
);

-- Geocode cache, one row per postal code (Singapore postal codes are 6 digits).
create table public.postal_codes (
  postal_code text primary key check (postal_code ~ '^[0-9]{6}$'),
  lat numeric(9, 6) not null check (lat between 1.15 and 1.48),
  lng numeric(9, 6) not null check (lng between 103.6 and 104.1),
  formatted_address text,
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('JB' || nextval('public.order_code_seq')::text),
  slot_id uuid not null references public.delivery_slots (id) on delete restrict,
  source public.order_source not null default 'web',
  status public.order_status not null default 'confirmed',
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  email text not null check (char_length(email) <= 254),
  phone text not null check (char_length(phone) <= 32),
  address_line1 text not null check (char_length(address_line1) <= 300),
  address_line2 text check (char_length(address_line2) <= 120),
  postal_code text not null check (postal_code ~ '^[0-9]{6}$'),
  lat numeric(9, 6) check (lat between 1.15 and 1.48),
  lng numeric(9, 6) check (lng between 103.6 and 104.1),
  notes text check (char_length(notes) <= 1000),
  driver_note text check (char_length(driver_note) <= 500),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  gst numeric(10, 2) not null check (gst >= 0),
  total numeric(10, 2) not null check (total >= 0),
  payment_status public.payment_status not null default 'paid',
  payment_method text check (char_length(payment_method) <= 60),
  tracking_token text not null unique default public.random_token(),
  created_at timestamptz not null default now()
);
create index orders_slot_status_idx on public.orders (slot_id, status);
create index orders_created_at_id_idx on public.orders (created_at desc, id desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  name_snapshot text not null check (char_length(name_snapshot) <= 120),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  qty integer not null check (qty between 1 and 100),
  line_total numeric(10, 2) not null check (line_total >= 0)
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_menu_item_id_idx on public.order_items (menu_item_id);

-- One run = one vehicle trip (temporary Grab driver) for a slot.
create table public.delivery_runs (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.delivery_slots (id) on delete cascade,
  run_number integer not null check (run_number > 0),
  status public.run_status not null default 'planned',
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  driver_name text check (char_length(driver_name) <= 120),
  driver_phone text check (char_length(driver_phone) <= 32),
  vehicle_plate text check (char_length(vehicle_plate) <= 16),
  driver_token text not null unique default public.random_token(),
  planned_departure timestamptz,
  total_km numeric(8, 2) check (total_km >= 0),
  est_duration_min integer check (est_duration_min >= 0),
  created_at timestamptz not null default now(),
  unique (slot_id, run_number)
);

create table public.run_stops (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.delivery_runs (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  sequence integer not null check (sequence > 0),
  eta timestamptz,
  leg_km numeric(8, 2) check (leg_km >= 0),
  status public.stop_status not null default 'pending',
  failure_reason text check (char_length(failure_reason) <= 300),
  delivered_at timestamptz
);
create index run_stops_run_sequence_idx on public.run_stops (run_id, sequence);

-- Cached AI outputs (e.g. forecast briefings) to avoid repeated model calls.
create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (kind, key)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- Public (anon) access is limited to the active menu and open slots. Orders, runs and
-- tracking are exposed only through narrow security-definer functions (later migrations).
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.menu_items enable row level security;
alter table public.delivery_slots enable row level security;
alter table public.postal_codes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.delivery_runs enable row level security;
alter table public.run_stops enable row level security;
alter table public.ai_insights enable row level security;

create policy "admin manages settings" on public.settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages menu" on public.menu_items
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages slots" on public.delivery_slots
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages postal codes" on public.postal_codes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages orders" on public.orders
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages order items" on public.order_items
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages runs" on public.delivery_runs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages stops" on public.run_stops
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages ai insights" on public.ai_insights
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "public reads active menu" on public.menu_items
  for select to anon, authenticated using (is_active);
create policy "public reads open slots" on public.delivery_slots
  for select to anon, authenticated using (is_open);
