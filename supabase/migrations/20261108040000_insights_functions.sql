-- Insights: demand aggregates for a date range, computed in SQL (one round trip, no order rows
-- shipped to the app). Runs as the caller (security invoker), so admin RLS applies.

-- p_booked_by: also count orders placed up to this instant (booking pace vs last year).
create function public.admin_demand_summary(p_from date, p_to date, p_booked_by timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'INVALID_RANGE';
  end if;

  return (
    with slot_rows as (
      select
        s.id, s.service_date, s.window_start, s.window_end, s.rib_capacity, s.ribs_booked,
        count(o.id) filter (where o.status <> 'cancelled')::integer as orders,
        count(o.id) filter (where o.status <> 'cancelled' and o.created_at <= p_booked_by)::integer as booked_by,
        coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as revenue
      from public.delivery_slots s
      left join public.orders o on o.slot_id = s.id
      where s.service_date between p_from and p_to
      group by s.id
    ),
    sectors as (
      select left(o.postal_code, 2) as sector, count(*)::integer as orders
      from public.orders o
      join public.delivery_slots s on s.id = o.slot_id
      where s.service_date between p_from and p_to and o.status <> 'cancelled'
      group by 1
    )
    select jsonb_build_object(
      'slots', coalesce((
        select jsonb_agg(jsonb_build_object(
          'slot_id', id,
          'service_date', service_date,
          'window_start', window_start,
          'window_end', window_end,
          'rib_capacity', rib_capacity,
          'ribs_booked', ribs_booked,
          'orders', orders,
          'booked_by', booked_by,
          'revenue', revenue::text
        ) order by window_start)
        from slot_rows
      ), '[]'::jsonb),
      'sectors', coalesce((
        select jsonb_agg(jsonb_build_object('sector', sector, 'orders', orders) order by orders desc)
        from sectors
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.admin_demand_summary(date, date, timestamptz) from public, anon;
grant execute on function public.admin_demand_summary(date, date, timestamptz) to authenticated;
