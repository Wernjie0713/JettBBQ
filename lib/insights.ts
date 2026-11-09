// Demand insights and the December 2026 forecast. All numbers are computed here (SQL aggregates +
// the route optimiser on last year's real orders); the AI only writes the briefing from them.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSettings } from "./admin-data.ts";
import { BUSINESS_TIMEZONE } from "./config.ts";
import { getDispatchOrders, routingParams } from "./dispatch.ts";
import { formatWindow, toCents } from "./format.ts";
import { optimise, type RoutingStop } from "./routing/optimise.ts";
import { areaOfSector } from "./sg-districts.ts";

export const LAST_SEASON = { from: "2025-12-01", to: "2025-12-31", label: "December 2025" };
export const NEXT_SEASON = { from: "2026-12-01", to: "2026-12-31", label: "December 2026" };
export const GROWTH_OPTIONS = [0, 10, 25] as const;
const PEAK_SLOTS = 6;
const TOP_AREAS = 10;

type DemandSlot = {
  slot_id: string;
  service_date: string;
  window_start: string;
  window_end: string;
  rib_capacity: number;
  ribs_booked: number;
  orders: number;
  booked_by: number;
  revenue: string;
};
type Demand = { slots: DemandSlot[]; sectors: { sector: string; orders: number }[] };

async function getDemand(db: SupabaseClient, from: string, to: string, bookedBy: Date): Promise<Demand> {
  const { data, error } = await db.rpc("admin_demand_summary", {
    p_from: from,
    p_to: to,
    p_booked_by: bookedBy.toISOString(),
  });
  if (error) throw new Error(`admin_demand_summary: ${error.message}`);
  return data as Demand;
}

const timeOfDay = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const hhmm = (instant: string) => timeOfDay.format(new Date(instant)); // "17:00", sortable

export type PeakSlot = {
  date: string; // 2025 service date
  window: string;
  orders2025: number;
  cars2025: number; // optimiser, current settings
  km2025: number;
  orders2026: number;
  cars2026: number;
  ribs2026: number;
  ribCapacity2026: number | null; // same date and time this year, if the slot exists
};

export type Insights = {
  growthPct: number;
  carCapacity: number;
  last: { orders: number; revenueCents: number; ribs: number; peakDay: { date: string; orders: number } | null; bookedAtThisPoint: number };
  next: { bookedSoFar: number; forecastOrders: number };
  byDay: { date: string; orders: number }[];
  byWindow: { window: string; orders: number }[];
  areas: { area: string; orders: number }[];
  peaks: PeakSlot[];
};

/**
 * Last year's stops plus the extra orders growth implies. Extra orders are assumed to come from
 * the same places, picked evenly through the list (deterministic, so the forecast is stable).
 */
export function scaleDemand(stops: RoutingStop[], growth: number): RoutingStop[] {
  const extra = Math.max(0, Math.round(stops.length * growth) - stops.length);
  const copies = Array.from({ length: extra }, (_, i) => {
    const source = stops[Math.floor((i * stops.length) / extra)];
    return { ...source, id: `${source.id}#${i + 1}` };
  });
  return [...stops, ...copies];
}

export async function getInsights(db: SupabaseClient, growthPct: number): Promise<Insights> {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setUTCFullYear(now.getUTCFullYear() - 1);

  const [settings, last, next] = await Promise.all([
    getSettings(db),
    getDemand(db, LAST_SEASON.from, LAST_SEASON.to, yearAgo),
    getDemand(db, NEXT_SEASON.from, NEXT_SEASON.to, now),
  ]);
  const growth = 1 + growthPct / 100;

  const byDayMap = new Map<string, number>();
  for (const s of last.slots) byDayMap.set(s.service_date, (byDayMap.get(s.service_date) ?? 0) + s.orders);
  const byDay = [...byDayMap].map(([date, orders]) => ({ date, orders }));
  const peakDay = byDay.reduce<{ date: string; orders: number } | null>((best, d) => (!best || d.orders > best.orders ? d : best), null);

  const windows = new Map<string, { key: string; window: string; orders: number }>();
  for (const s of last.slots) {
    const key = `${hhmm(s.window_start)}-${hhmm(s.window_end)}`;
    const entry = windows.get(key) ?? { key, window: formatWindow(s.window_start, s.window_end), orders: 0 };
    entry.orders += s.orders;
    windows.set(key, entry);
  }
  const byWindow = [...windows.values()].sort((a, b) => a.key.localeCompare(b.key)).map(({ window, orders }) => ({ window, orders }));

  const areaMap = new Map<string, number>();
  for (const s of last.sectors) areaMap.set(areaOfSector(s.sector), (areaMap.get(areaOfSector(s.sector)) ?? 0) + s.orders);
  const areas = [...areaMap]
    .map(([area, orders]) => ({ area, orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, TOP_AREAS);

  // Cars needed on last year's busiest slots, planned by the real optimiser with today's settings:
  // once on last year's orders, and again on that demand scaled by the assumed growth.
  const capacity2026 = new Map(next.slots.map((s) => [`${s.service_date.slice(5)} ${hhmm(s.window_start)}`, s.rib_capacity]));
  const peakSlots = [...last.slots].sort((a, b) => b.orders - a.orders).slice(0, PEAK_SLOTS);
  const peaks = await Promise.all(
    peakSlots.map(async (slot): Promise<PeakSlot> => {
      const orders = await getDispatchOrders(db, slot.slot_id);
      const stops = orders
        .filter((o) => o.lat !== null && o.lng !== null)
        .map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, load: o.load }));
      const params = routingParams(settings, slot);
      const plan = optimise(stops, params);
      const plan2026 = growthPct === 0 ? plan : optimise(scaleDemand(stops, growth), params);
      return {
        date: slot.service_date,
        window: formatWindow(slot.window_start, slot.window_end),
        orders2025: slot.orders,
        cars2025: plan.metrics.cars,
        km2025: Math.round(plan.metrics.totalKm),
        orders2026: Math.round(slot.orders * growth),
        cars2026: plan2026.metrics.cars,
        ribs2026: Math.round(slot.ribs_booked * growth),
        ribCapacity2026: capacity2026.get(`${slot.service_date.slice(5)} ${hhmm(slot.window_start)}`) ?? null,
      };
    }),
  );
  peaks.sort((a, b) => a.date.localeCompare(b.date) || a.window.localeCompare(b.window));

  const lastOrders = last.slots.reduce((n, s) => n + s.orders, 0);
  return {
    growthPct,
    carCapacity: Number(settings.vehicle_capacity_units),
    last: {
      orders: lastOrders,
      revenueCents: last.slots.reduce((n, s) => n + toCents(s.revenue), 0),
      ribs: last.slots.reduce((n, s) => n + s.ribs_booked, 0),
      peakDay,
      bookedAtThisPoint: last.slots.reduce((n, s) => n + s.booked_by, 0),
    },
    next: {
      bookedSoFar: next.slots.reduce((n, s) => n + s.orders, 0),
      forecastOrders: Math.round(lastOrders * growth),
    },
    byDay,
    byWindow,
    areas,
    peaks,
  };
}

/** What the AI briefing is written from. */
export function briefingInput(insights: Insights) {
  return {
    lastSeason: LAST_SEASON.label,
    nextSeason: NEXT_SEASON.label,
    assumedGrowthPct: insights.growthPct,
    carCapacityBoxes: insights.carCapacity,
    lastYear: {
      orders: insights.last.orders,
      ribs: insights.last.ribs,
      peakDay: insights.last.peakDay,
      ordersBookedByThisDateLastYear: insights.last.bookedAtThisPoint,
    },
    thisYear: { ordersBookedSoFar: insights.next.bookedSoFar, forecastOrders: insights.next.forecastOrders },
    peakSlots: insights.peaks,
    topAreas: insights.areas.slice(0, 5),
  };
}

/**
 * Cache key for the briefing in ai_insights: the plan-shaping numbers only. Booking pace (booked so
 * far, and by this date last year) moves with every new order and every day, so it is left out —
 * otherwise a saved briefing would vanish on the next reload. "Rewrite briefing" refreshes it.
 */
export function briefingKey(input: ReturnType<typeof briefingInput>): string {
  const stable = {
    ...input,
    lastYear: { orders: input.lastYear.orders, ribs: input.lastYear.ribs, peakDay: input.lastYear.peakDay },
    thisYear: { forecastOrders: input.thisYear.forecastOrders },
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 40);
}

export type Briefing = { text: string; generated_at: string };

export async function getBriefing(db: SupabaseClient, key: string): Promise<Briefing | null> {
  const { data, error } = await db
    .from("ai_insights")
    .select("payload")
    .eq("kind", "forecast")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`getBriefing: ${error.message}`);
  const payload = data?.payload as Partial<Briefing> | undefined;
  // Database JSON is a boundary: only trust the expected shape.
  return payload && typeof payload.text === "string" && typeof payload.generated_at === "string"
    ? { text: payload.text, generated_at: payload.generated_at }
    : null;
}
