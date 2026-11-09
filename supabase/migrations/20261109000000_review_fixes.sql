-- Code-review fixes:
-- 1. order_items.rib_units: snapshot of ribs reserved per unit, so cancelling releases exactly
--    what the order took, even if the menu changes later.
-- 2. place_order: idempotent replay runs before the address/slot checks, so a retried checkout
--    returns the original order even after the slot was closed.
-- 3. orders.is_zero_value: flags $0 orders (comps, manual entries) kept from the import (docs/ARCHITECTURE.md §9).
-- 4. Checkout reads slot availability through a narrow RPC instead of the table (docs/ARCHITECTURE.md §4).
-- (No CASE ... END THEN anywhere: the Supabase CLI statement splitter mis-parses it.)

-- ---------------------------------------------------------------------------
-- 1. Rib snapshot on order lines
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column rib_units integer not null default 0 check (rib_units >= 0);

-- Existing lines: best available value is the menu as it is now (unchanged since the seed).
update public.order_items i
set rib_units = m.rib_units
from public.menu_items m
where m.id = i.menu_item_id;

-- ---------------------------------------------------------------------------
-- 3. $0 order flag
-- ---------------------------------------------------------------------------
alter table public.orders
  add column is_zero_value boolean generated always as (total = 0) stored;

-- ---------------------------------------------------------------------------
-- 2. place_order: replay first, snapshot ribs
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key uuid;
  v_slot_id uuid;
  v_name text := btrim(coalesce(p ->> 'customer_name', ''));
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_phone text := btrim(coalesce(p ->> 'phone', ''));
  v_line1 text := btrim(coalesce(p ->> 'address_line1', ''));
  v_line2 text := nullif(btrim(coalesce(p ->> 'address_line2', '')), '');
  v_postal_code text := btrim(coalesce(p ->> 'postal_code', ''));
  v_notes text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_settings public.settings%rowtype;
  v_slot public.delivery_slots%rowtype;
  v_postal public.postal_codes%rowtype;
  v_existing record;
  v_unavailable integer;
  v_ribs integer;
  v_subtotal numeric(10, 2);
  v_fee numeric(10, 2);
  v_gst numeric(10, 2);
  v_has_christmas boolean;
  v_lead interval;
  v_order_id uuid;
  v_code text;
  v_token text;
begin
  -- Casts live here (not in DECLARE) so bad input is caught by the handler below.
  v_key := (p ->> 'idempotency_key')::uuid;
  v_slot_id := (p ->> 'slot_id')::uuid;

  -- Input validation (the server action validates too; this is the last line of defence).
  if v_key is null or v_slot_id is null
     or jsonb_typeof(p -> 'items') is distinct from 'array'
     or jsonb_array_length(p -> 'items') not between 1 and 30
     or char_length(v_name) not between 1 and 120
     or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or v_phone !~ '^\+?[0-9][0-9 ]{6,18}$'
     or v_postal_code !~ '^[0-9]{6}$'
     or char_length(v_line1) not between 1 and 300
     or char_length(coalesce(v_line2, '')) > 300
     or char_length(coalesce(v_notes, '')) > 1000
     or exists (
       select 1 from jsonb_array_elements(p -> 'items') e
       where (e ->> 'menu_item_id') is null or coalesce((e ->> 'qty')::integer, 0) not between 1 and 50
     )
  then
    raise exception 'INVALID_INPUT';
  end if;

  -- Idempotent replay first: a retried checkout gets its original order back, whatever has
  -- happened to the slot or address since. (A concurrent first attempt is caught by ON CONFLICT.)
  select code, tracking_token into v_existing from public.orders where idempotency_key = v_key;
  if found then
    return jsonb_build_object('code', v_existing.code, 'tracking_token', v_existing.tracking_token);
  end if;

  select * into v_postal from public.postal_codes where postal_code = v_postal_code;
  if not found then
    raise exception 'ADDRESS_NOT_FOUND';
  end if;

  -- Serialise orders for this slot so capacity cannot be oversold.
  select * into v_slot from public.delivery_slots where id = v_slot_id for update;
  if not found or not v_slot.is_open then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  with req as (
    select (e ->> 'menu_item_id')::uuid as menu_item_id, sum((e ->> 'qty')::integer) as qty
    from jsonb_array_elements(p -> 'items') e
    group by 1
  )
  select
    count(*) filter (
      where m.id is null or not m.is_active
        or (m.available_from is not null and v_slot.service_date < m.available_from)
        or (m.available_to is not null and v_slot.service_date > m.available_to)
    ),
    coalesce(sum(m.rib_units * r.qty), 0),
    coalesce(sum(m.price * r.qty), 0),
    coalesce(bool_or(m.category = 'christmas'), false)
  into v_unavailable, v_ribs, v_subtotal, v_has_christmas
  from req r
  left join public.menu_items m on m.id = r.menu_item_id;

  if v_unavailable > 0 then
    raise exception 'ITEM_UNAVAILABLE';
  end if;

  -- Lead time: 24 hours; Christmas items need 3 days (founder's published rules).
  v_lead := interval '24 hours';
  if v_has_christmas then
    v_lead := interval '3 days';
  end if;
  if v_slot.window_start < now() + v_lead then
    raise exception 'TOO_LATE';
  end if;

  if v_ribs > 0 and v_slot.ribs_booked + v_ribs > v_slot.rib_capacity then
    raise exception 'SLOT_FULL';
  end if;

  select * into v_settings from public.settings;
  v_fee := public.delivery_fee(v_postal_code, v_subtotal);
  v_gst := round((v_subtotal + v_fee) * v_settings.gst_rate, 2);

  insert into public.orders (
    slot_id, source, status, customer_name, email, phone, address_line1, address_line2,
    postal_code, lat, lng, notes, subtotal, delivery_fee, gst, total,
    payment_status, payment_method, idempotency_key
  ) values (
    v_slot.id, 'web', 'confirmed', v_name, v_email, v_phone, v_line1, v_line2,
    v_postal_code, v_postal.lat, v_postal.lng, v_notes, v_subtotal, v_fee, v_gst, v_subtotal + v_fee + v_gst,
    'paid', 'demo', v_key
  )
  on conflict (idempotency_key) do nothing
  returning id, code, tracking_token into v_order_id, v_code, v_token;

  if v_order_id is null then
    select code, tracking_token into v_existing from public.orders where idempotency_key = v_key;
    return jsonb_build_object('code', v_existing.code, 'tracking_token', v_existing.tracking_token);
  end if;

  with req as (
    select (e ->> 'menu_item_id')::uuid as menu_item_id, sum((e ->> 'qty')::integer) as qty
    from jsonb_array_elements(p -> 'items') e
    group by 1
  )
  insert into public.order_items (order_id, menu_item_id, name_snapshot, unit_price, qty, line_total, rib_units)
  select v_order_id, m.id, m.name, m.price, r.qty, m.price * r.qty, m.rib_units
  from req r
  join public.menu_items m on m.id = r.menu_item_id;

  update public.delivery_slots set ribs_booked = ribs_booked + v_ribs where id = v_slot.id;

  return jsonb_build_object('code', v_code, 'tracking_token', v_token);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'INVALID_INPUT';
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. admin_cancel_order: release the snapshot, not today's menu
-- ---------------------------------------------------------------------------
create or replace function public.admin_cancel_order(p_order_id uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_ribs integer;
begin
  if not (select public.is_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_order.status = 'cancelled' then
    return 'ALREADY_CANCELLED';
  end if;
  if v_order.status not in ('confirmed', 'planned') then
    raise exception 'NOT_CANCELLABLE';
  end if;

  -- Exactly the ribs this order reserved, from the snapshot taken when it was placed.
  select coalesce(sum(i.rib_units * i.qty), 0)::integer into v_ribs
  from public.order_items i
  where i.order_id = p_order_id;

  update public.orders
  set status = 'cancelled',
      payment_status = case when payment_status = 'paid' then 'refunded'::public.payment_status else payment_status end
  where id = p_order_id;

  -- No clamping: if the counter would go negative the books are wrong, and the
  -- ribs_booked >= 0 check fails the cancellation loudly instead of hiding it.
  update public.delivery_slots
  set ribs_booked = ribs_booked - v_ribs
  where id = v_order.slot_id;

  -- A cancelled order no longer belongs on a delivery run.
  delete from public.run_stops where order_id = p_order_id;

  return 'CANCELLED';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Public slot availability via RPC only
-- ---------------------------------------------------------------------------
-- Open slots starting in [p_from, p_to), with remaining ribs only (no capacity or booked counts).
create function public.get_bookable_slots(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  service_date date,
  window_start timestamptz,
  window_end timestamptz,
  ribs_remaining integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.service_date, s.window_start, s.window_end, greatest(0, s.rib_capacity - s.ribs_booked)
  from public.delivery_slots s
  where s.is_open
    and s.window_start >= p_from
    and s.window_start < p_to
    and p_to - p_from <= interval '120 days'
  order by s.window_start
  limit 500;
$$;

revoke execute on function public.get_bookable_slots(timestamptz, timestamptz) from public;
grant execute on function public.get_bookable_slots(timestamptz, timestamptz) to anon, authenticated;

drop policy "public reads open slots" on public.delivery_slots;
