// Dispatch data: loading a slot's orders and runs, and turning optimiser output into the
// admin_save_plan payload. Server-only callers pass the admin's session client (RLS applies).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminSettings, OrderStatus } from "./admin-data.ts";
import { type DispatchRules, toConstraints } from "./dispatch-rules.ts";
import type { PlannedRun, RoutingParams, RoutingStop } from "./routing/optimise.ts";
import { runColor } from "./run-colors.ts";
import { check, knownErrorMessage } from "./supabase/check.ts";

export type DispatchSlot = { id: string; service_date: string; window_start: string; window_end: string };

export type DispatchOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  load: number; // car space, in Beef Rib Set boxes
};

export type StopStatus = "pending" | "delivered" | "failed";
export type RunStatus = "planned" | "assigned" | "in_progress" | "completed";

export type DispatchStop = {
  id: string;
  order_id: string;
  sequence: number;
  eta: string | null;
  leg_km: number | null;
  status: StopStatus;
  failure_reason: string | null;
};

export type DispatchRun = {
  id: string;
  run_number: number;
  status: RunStatus;
  color: string;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_plate: string | null;
  driver_token: string;
  planned_departure: string | null;
  total_km: number | null;
  est_duration_min: number | null;
  stops: DispatchStop[];
};

export async function getDispatchSlot(db: SupabaseClient, slotId: string): Promise<DispatchSlot | null> {
  return check(
    "getDispatchSlot",
    await db.from("delivery_slots").select("id, service_date, window_start, window_end").eq("id", slotId).maybeSingle(),
  );
}

/** Non-cancelled orders in the slot with their car load (bounded in SQL). */
export async function getDispatchOrders(db: SupabaseClient, slotId: string): Promise<DispatchOrder[]> {
  const rows = check<DispatchOrder[]>("admin_dispatch_orders", await db.rpc("admin_dispatch_orders", { p_slot_id: slotId }));
  // numeric arrives as a JSON number from PostgREST; normalise defensively (DB JSON is a boundary).
  return rows.map((o) => ({
    ...o,
    lat: o.lat === null ? null : Number(o.lat),
    lng: o.lng === null ? null : Number(o.lng),
    load: Number(o.load) || 0,
  }));
}

export async function getRuns(db: SupabaseClient, slotId: string): Promise<DispatchRun[]> {
  const runs = check<DispatchRun[]>(
    "getRuns",
    await db
      .from("delivery_runs")
      .select(
        "id, run_number, status, color, driver_name, driver_phone, vehicle_plate, driver_token, planned_departure, total_km, est_duration_min, stops:run_stops(id, order_id, sequence, eta, leg_km, status, failure_reason)",
      )
      .eq("slot_id", slotId)
      .order("run_number")
      .order("sequence", { referencedTable: "run_stops" })
      .limit(100),
  );
  return runs.map((r) => ({
    ...r,
    total_km: r.total_km === null ? null : Number(r.total_km),
    stops: r.stops.map((s) => ({ ...s, leg_km: s.leg_km === null ? null : Number(s.leg_km) })),
  }));
}

export function routingParams(settings: AdminSettings, slot: Pick<DispatchSlot, "window_start" | "window_end">): RoutingParams {
  return {
    depot: { lat: Number(settings.depot_lat), lng: Number(settings.depot_lng) },
    windowStart: Date.parse(slot.window_start),
    windowEnd: Date.parse(slot.window_end),
    vehicleCapacity: Number(settings.vehicle_capacity_units),
    serviceMinutes: settings.service_minutes_per_stop,
    speedKmh: Number(settings.avg_speed_kmh),
    roadFactor: Number(settings.road_factor),
  };
}

/** Orders the optimiser can place: geocoded and not yet on the road. */
export function routableStops(orders: DispatchOrder[]): RoutingStop[] {
  return orders
    .filter((o) => o.lat !== null && o.lng !== null && (o.status === "confirmed" || o.status === "planned"))
    .map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, load: o.load }));
}

/**
 * The dispatcher's rules as optimiser constraints for this slot. Only orders the optimiser can
 * place are matched by code; rules naming any other order come back in unknownCodes.
 */
export function slotConstraints(rules: DispatchRules, orders: DispatchOrder[], serviceDate: string) {
  const routable = new Set(routableStops(orders).map((s) => s.id));
  const idByCode = new Map(orders.filter((o) => routable.has(o.id)).map((o) => [o.code, o.id]));
  return toConstraints(rules, idByCode, serviceDate);
}

export type SavedPlanNumbers = { cars: number; stops: number; totalKm: number; lateStops: number };
type Deadline = { orderId: string; by: number };

/**
 * Ids of saved stops that arrive late: ETA after the window end or after the order's deadline
 * rule, whichever is earlier (the same test the optimiser plans against).
 */
export function lateStopIds(runs: DispatchRun[], windowEnd: string, deadlines: Deadline[] = []): Set<string> {
  const end = Date.parse(windowEnd);
  const due = new Map<string, number>();
  for (const { orderId, by } of deadlines) due.set(orderId, Math.min(by, due.get(orderId) ?? Infinity));
  const late = runs
    .flatMap((r) => r.stops)
    .filter((s) => s.eta && Date.parse(s.eta) > Math.min(end, due.get(s.order_id) ?? Infinity));
  return new Set(late.map((s) => s.id));
}

/** Headline numbers of a saved plan (late as defined by lateStopIds). */
export function savedPlanNumbers(runs: DispatchRun[], windowEnd: string, deadlines: Deadline[] = []): SavedPlanNumbers {
  return {
    cars: runs.filter((r) => r.stops.length > 0).length,
    stops: runs.reduce((n, r) => n + r.stops.length, 0),
    totalKm: runs.reduce((n, r) => n + (r.total_km ?? 0), 0),
    lateStops: lateStopIds(runs, windowEnd, deadlines).size,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * admin_save_plan payload. Empty runs are dropped, the rest numbered 1…n with their colours.
 * keepIds[i] is the existing run id for runs[i] (keeps its driver details and link), or null.
 */
export function savePayload(runs: PlannedRun[], keepIds: (string | null)[] = []) {
  return runs
    .map((run, i) => ({ run, id: keepIds[i] ?? null }))
    .filter(({ run }) => run.stops.length > 0)
    .map(({ run, id }, i) => ({
      id,
      run_number: i + 1,
      color: runColor(i + 1),
      planned_departure: new Date(run.departure).toISOString(),
      total_km: round2(run.km),
      est_duration_min: run.durationMin,
      stops: run.stops.map((s, j) => ({
        order_id: s.id,
        sequence: j + 1,
        eta: new Date(s.eta).toISOString(),
        leg_km: round2(s.legKm),
      })),
    }));
}

const PLAN_ERRORS: Record<string, string> = {
  PLAN_LOCKED: "A driver has already started a run in this slot, so the plan can't change.",
  ORDERS_CHANGED: "Orders changed while planning. Reload the page and try again.",
  NOT_FOUND: "That delivery slot no longer exists.",
};

/** Plan errors raised by admin_save_plan, in words a dispatcher can act on. */
export function planErrorMessage(message: string): string {
  return knownErrorMessage({ message }, PLAN_ERRORS) ?? "Couldn't save the plan. Please try again.";
}
