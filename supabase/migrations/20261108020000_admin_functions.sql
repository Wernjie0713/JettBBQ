-- Admin back office: per-slot day summary (aggregated in SQL) and atomic order cancellation.
-- Both run as the calling user (security invoker), so the admin RLS policies still apply.

-- Order search by postal code (admin orders list).
create index orders_postal_code_idx on public.orders (postal_code);

-- One row per slot on a business date, with order counts and revenue for active orders.
create function public.admin_day_summary(p_date date)
returns table (
  slot_id uuid,
  window_start timestamptz,
  window_end timestamptz,
  is_open boolean,
  rib_capacity integer,
  ribs_booked integer,
  active_orders integer,
  cancelled_orders integer,
  revenue text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.window_start,
    s.window_end,
    s.is_open,
    s.rib_capacity,
    s.ribs_booked,
    count(o.id) filter (where o.status <> 'cancelled')::integer,
    count(o.id) filter (where o.status = 'cancelled')::integer,
    coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)::text
  from public.delivery_slots s
  left join public.orders o on o.slot_id = s.id
  where s.service_date = p_date
  group by s.id
  order by s.window_start;
$$;

-- Cancel an order that has not left the kitchen, and give its ribs back to the slot.
-- Idempotent: cancelling an already-cancelled order changes nothing.
create function public.admin_cancel_order(p_order_id uuid)
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

  -- Ribs this order reserved (rib_units from the current menu; order_items has no rib snapshot).
  select coalesce(sum(m.rib_units * i.qty), 0)::integer into v_ribs
  from public.order_items i
  join public.menu_items m on m.id = i.menu_item_id
  where i.order_id = p_order_id;

  update public.orders
  set status = 'cancelled',
      payment_status = case when payment_status = 'paid' then 'refunded'::public.payment_status else payment_status end
  where id = p_order_id;

  -- Only release what this order took; never drive the counter below zero.
  update public.delivery_slots
  set ribs_booked = greatest(0, ribs_booked - v_ribs)
  where id = v_order.slot_id;

  -- A cancelled order no longer belongs on a delivery run.
  delete from public.run_stops where order_id = p_order_id;

  return 'CANCELLED';
end;
$$;

revoke execute on function public.admin_day_summary(date) from public, anon;
revoke execute on function public.admin_cancel_order(uuid) from public, anon;
grant execute on function public.admin_day_summary(date) to authenticated;
grant execute on function public.admin_cancel_order(uuid) to authenticated;
