-- Customer ordering: delivery quote, atomic order placement, tracking lookup.
-- All money maths happens here in numeric; the browser never supplies prices or coordinates.

alter table public.orders add column idempotency_key uuid unique;

-- Great-circle distance in km (physical distance, not money, so double precision is fine).
create function public.distance_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (2 * 6371 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::double precision) / 2), 2)
    + cos(radians(lat1::double precision)) * cos(radians(lat2::double precision))
      * power(sin(radians((lng2 - lng1)::double precision) / 2), 2)
  )))::numeric;
$$;

-- Delivery fee for a cached postal code; null when the postal code is unknown.
-- Free from settings.free_delivery_threshold (pre-GST subtotal), else base + per-km (whole km, road-adjusted).
create function public.delivery_fee(p_postal_code text, p_subtotal numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_subtotal >= s.free_delivery_threshold then 0.00
    else round(
      s.fee_base + s.fee_per_km
        * round(public.distance_km(s.depot_lat, s.depot_lng, pc.lat, pc.lng) * s.road_factor),
      2)
  end
  from public.settings s
  cross join public.postal_codes pc
  where pc.postal_code = p_postal_code;
$$;

-- Public: fee preview for checkout. Returns money as text to avoid float rounding in JS.
create function public.quote_delivery(p_postal_code text, p_subtotal numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fee numeric;
  v_threshold numeric;
begin
  if p_postal_code !~ '^[0-9]{6}$' or p_subtotal is null or p_subtotal < 0 then
    raise exception 'INVALID_INPUT';
  end if;
  select free_delivery_threshold into v_threshold from public.settings;
  v_fee := public.delivery_fee(p_postal_code, p_subtotal);
  return jsonb_build_object(
    'found', v_fee is not null,
    'fee', v_fee::text,
    'free_delivery_threshold', v_threshold::text
  );
end;
$$;

-- Public: place an order atomically.
-- Locks the slot row, re-checks capacity, availability and lead time, prices from menu_items,
-- and is idempotent on idempotency_key (a retried checkout returns the original order).
create function public.place_order(p jsonb)
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

  select * into v_postal from public.postal_codes where postal_code = v_postal_code;
  if not found then
    raise exception 'ADDRESS_NOT_FOUND';
  end if;

  -- Serialise orders for this slot so capacity cannot be oversold.
  select * into v_slot from public.delivery_slots where id = v_slot_id for update;
  if not found or not v_slot.is_open then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  -- Idempotent replay, checked under the slot lock.
  select code, tracking_token into v_existing from public.orders where idempotency_key = v_key;
  if found then
    return jsonb_build_object('code', v_existing.code, 'tracking_token', v_existing.tracking_token);
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
  -- (Plain IF rather than CASE ... END THEN: the Supabase CLI statement splitter mis-parses the latter.)
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
  insert into public.order_items (order_id, menu_item_id, name_snapshot, unit_price, qty, line_total)
  select v_order_id, m.id, m.name, m.price, r.qty, m.price * r.qty
  from req r
  join public.menu_items m on m.id = r.menu_item_id;

  update public.delivery_slots set ribs_booked = ribs_booked + v_ribs where id = v_slot.id;

  return jsonb_build_object('code', v_code, 'tracking_token', v_token);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'INVALID_INPUT';
end;
$$;

-- Public: order status for the tracking page. The 64-hex token is the only key.
create function public.get_order_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'created_at', o.created_at,
    'customer_name', o.customer_name,
    'address_line1', o.address_line1,
    'address_line2', o.address_line2,
    'postal_code', o.postal_code,
    'subtotal', o.subtotal::text,
    'delivery_fee', o.delivery_fee::text,
    'gst', o.gst::text,
    'total', o.total::text,
    'payment_status', o.payment_status,
    'window_start', s.window_start,
    'window_end', s.window_end,
    'eta', rs.eta,
    'delivered_at', rs.delivered_at,
    'items', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'qty', i.qty, 'line_total', i.line_total::text)
          order by i.name_snapshot),
        '[]'::jsonb)
      from public.order_items i
      where i.order_id = o.id
    )
  )
  from public.orders o
  join public.delivery_slots s on s.id = o.slot_id
  left join public.run_stops rs on rs.order_id = o.id
  where p_token ~ '^[0-9a-f]{64}$' and o.tracking_token = p_token;
$$;

-- Only the three public entry points are callable without admin rights.
revoke execute on function public.delivery_fee(text, numeric) from public, anon, authenticated;
grant execute on function public.quote_delivery(text, numeric) to anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;
grant execute on function public.get_order_by_token(text) to anon, authenticated;
