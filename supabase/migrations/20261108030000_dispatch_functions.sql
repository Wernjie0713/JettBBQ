-- Dispatch: orders to plan for a slot, atomic plan saving, and the driver link (no login).
-- Admin functions run as the caller (security invoker) so admin RLS applies; driver functions are
-- security definer and keyed by the run's 64-hex driver_token, which is the only credential.
-- (No CASE ... END THEN anywhere: the Supabase CLI statement splitter mis-parses it.)

-- Live dispatch board: admins receive run and stop changes (Realtime checks RLS select policies).
alter publication supabase_realtime add table public.delivery_runs, public.run_stops;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

-- Every non-cancelled order in a slot, with how much car space it needs (sum of item load units).
create function public.admin_dispatch_orders(p_slot_id uuid)
returns table (
  id uuid,
  code text,
  status public.order_status,
  customer_name text,
  phone text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  lat numeric,
  lng numeric,
  notes text,
  load numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    o.id, o.code, o.status, o.customer_name, o.phone, o.address_line1, o.address_line2,
    o.postal_code, o.lat, o.lng, o.notes,
    coalesce(sum(m.load_units * i.qty), 0)
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  left join public.menu_items m on m.id = i.menu_item_id
  where o.slot_id = p_slot_id and o.status <> 'cancelled'
  group by o.id
  order by o.code
  limit 1000;
$$;

-- Replace a slot's plan in one transaction.
-- p_runs: [{ id?, run_number, color, planned_departure, total_km, est_duration_min,
--            stops: [{ order_id, sequence, eta, leg_km }] }]
-- Runs passed with an id are kept (driver details and link survive); other runs of the slot are
-- deleted. Locked once any run of the slot has started.
create function public.admin_save_plan(p_slot_id uuid, p_runs jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_run jsonb;
  v_run_id uuid;
  v_order_ids uuid[];
  v_valid integer;
begin
  if not (select public.is_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if jsonb_typeof(p_runs) is distinct from 'array' or jsonb_array_length(p_runs) > 100 then
    raise exception 'INVALID_PLAN';
  end if;

  -- Serialise planning per slot.
  perform 1 from public.delivery_slots where id = p_slot_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if exists (
    select 1 from public.delivery_runs
    where slot_id = p_slot_id and status in ('in_progress', 'completed')
  ) then
    raise exception 'PLAN_LOCKED';
  end if;

  select coalesce(array_agg((st ->> 'order_id')::uuid), '{}')
  into v_order_ids
  from jsonb_array_elements(p_runs) r, jsonb_array_elements(r -> 'stops') st;

  if cardinality(v_order_ids) > 1000 then
    raise exception 'INVALID_PLAN';
  end if;

  -- Each order once, all from this slot, none cancelled or already on the road.
  select count(*) into v_valid
  from public.orders
  where id = any (v_order_ids) and slot_id = p_slot_id and status in ('confirmed', 'planned');
  if v_valid <> cardinality(v_order_ids)
     or cardinality(v_order_ids) <> (select count(distinct x) from unnest(v_order_ids) x) then
    raise exception 'ORDERS_CHANGED';
  end if;

  delete from public.delivery_runs
  where slot_id = p_slot_id
    and id not in (
      select (r ->> 'id')::uuid from jsonb_array_elements(p_runs) r where r ->> 'id' is not null
    );
  delete from public.run_stops
  where run_id in (select id from public.delivery_runs where slot_id = p_slot_id);
  -- Free up run numbers so kept runs can be renumbered without unique collisions.
  update public.delivery_runs set run_number = run_number + 10000 where slot_id = p_slot_id;

  for v_run in select value from jsonb_array_elements(p_runs) loop
    v_run_id := null;
    if v_run ->> 'id' is not null then
      update public.delivery_runs
      set run_number = (v_run ->> 'run_number')::integer,
          color = v_run ->> 'color',
          planned_departure = (v_run ->> 'planned_departure')::timestamptz,
          total_km = (v_run ->> 'total_km')::numeric,
          est_duration_min = (v_run ->> 'est_duration_min')::integer
      where id = (v_run ->> 'id')::uuid and slot_id = p_slot_id
      returning id into v_run_id;
      if v_run_id is null then
        raise exception 'INVALID_PLAN';
      end if;
    else
      insert into public.delivery_runs (slot_id, run_number, color, planned_departure, total_km, est_duration_min)
      values (
        p_slot_id,
        (v_run ->> 'run_number')::integer,
        v_run ->> 'color',
        (v_run ->> 'planned_departure')::timestamptz,
        (v_run ->> 'total_km')::numeric,
        (v_run ->> 'est_duration_min')::integer
      )
      returning id into v_run_id;
    end if;

    insert into public.run_stops (run_id, order_id, sequence, eta, leg_km)
    select v_run_id, (st ->> 'order_id')::uuid, (st ->> 'sequence')::integer,
           (st ->> 'eta')::timestamptz, (st ->> 'leg_km')::numeric
    from jsonb_array_elements(v_run -> 'stops') st;
  end loop;

  update public.orders set status = 'confirmed'
  where slot_id = p_slot_id and status = 'planned' and id <> all (v_order_ids);
  update public.orders set status = 'planned'
  where id = any (v_order_ids) and status = 'confirmed';

  return cardinality(v_order_ids);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
    or datetime_field_overflow or check_violation or unique_violation or not_null_violation then
    raise exception 'INVALID_PLAN';
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver (no login; the run's driver_token is the key)
-- ---------------------------------------------------------------------------

create function public.get_run(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'run_number', r.run_number,
    'color', r.color,
    'status', r.status,
    'driver_name', r.driver_name,
    'planned_departure', r.planned_departure,
    'total_km', r.total_km::text,
    'service_date', s.service_date,
    'window_start', s.window_start,
    'window_end', s.window_end,
    'stops', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', st.id,
        'sequence', st.sequence,
        'status', st.status,
        'eta', st.eta,
        'delivered_at', st.delivered_at,
        'failure_reason', st.failure_reason,
        'code', o.code,
        'customer_name', o.customer_name,
        'phone', o.phone,
        'address_line1', o.address_line1,
        'address_line2', o.address_line2,
        'postal_code', o.postal_code,
        'lat', o.lat,
        'lng', o.lng,
        'notes', o.notes,
        'driver_note', o.driver_note
      ) order by st.sequence), '[]'::jsonb)
      from public.run_stops st
      join public.orders o on o.id = st.order_id
      where st.run_id = r.id
    )
  )
  from public.delivery_runs r
  join public.delivery_slots s on s.id = r.slot_id
  where p_token ~ '^[0-9a-f]{64}$' and r.driver_token = p_token;
$$;

-- Driver taps "Start run": the run and its pending orders go out for delivery. Idempotent.
create function public.start_run(p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run public.delivery_runs%rowtype;
begin
  if p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'NOT_FOUND';
  end if;
  select * into v_run from public.delivery_runs where driver_token = p_token for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_run.status in ('in_progress', 'completed') then
    return v_run.status::text;
  end if;

  update public.delivery_runs set status = 'in_progress' where id = v_run.id;
  update public.orders o set status = 'out_for_delivery'
  from public.run_stops st
  where st.run_id = v_run.id and st.status = 'pending' and o.id = st.order_id and o.status = 'planned';
  return 'in_progress';
end;
$$;

-- Driver marks a stop delivered or failed (and can correct a mistake). Starts the run if needed;
-- completes it when no stop is left pending. Repeating the same mark changes nothing.
create function public.mark_stop(p_token text, p_stop_id uuid, p_status text, p_reason text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run public.delivery_runs%rowtype;
  v_stop public.run_stops%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'NOT_FOUND';
  end if;
  if p_status not in ('delivered', 'failed') then
    raise exception 'INVALID_INPUT';
  end if;
  if p_status = 'failed' and (v_reason is null or char_length(v_reason) > 300) then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_run from public.delivery_runs where driver_token = p_token for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  select * into v_stop from public.run_stops where id = p_stop_id and run_id = v_run.id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_stop.status::text = p_status and v_stop.failure_reason is not distinct from v_reason then
    return p_status;
  end if;

  if v_run.status in ('planned', 'assigned') then
    perform public.start_run(p_token);
  end if;

  update public.run_stops
  set status = p_status::public.stop_status,
      delivered_at = case when p_status = 'delivered' then now() end,
      failure_reason = case when p_status = 'failed' then v_reason end
  where id = v_stop.id;

  update public.orders set status = p_status::public.order_status
  where id = v_stop.order_id and status <> 'cancelled';

  if not exists (select 1 from public.run_stops where run_id = v_run.id and status = 'pending') then
    update public.delivery_runs set status = 'completed' where id = v_run.id;
  else
    update public.delivery_runs set status = 'in_progress' where id = v_run.id;
  end if;

  return p_status;
exception
  when invalid_text_representation then
    raise exception 'INVALID_INPUT';
end;
$$;

revoke execute on function public.admin_dispatch_orders(uuid) from public, anon;
revoke execute on function public.admin_save_plan(uuid, jsonb) from public, anon;
grant execute on function public.admin_dispatch_orders(uuid) to authenticated;
grant execute on function public.admin_save_plan(uuid, jsonb) to authenticated;

revoke execute on function public.get_run(text) from public;
revoke execute on function public.start_run(text) from public;
revoke execute on function public.mark_stop(text, uuid, text, text) from public;
grant execute on function public.get_run(text) to anon, authenticated;
grant execute on function public.start_run(text) to anon, authenticated;
grant execute on function public.mark_stop(text, uuid, text, text) to anon, authenticated;
