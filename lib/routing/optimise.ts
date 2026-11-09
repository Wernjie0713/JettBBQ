// Delivery run planner (docs/ARCHITECTURE.md §5). Pure and deterministic: no I/O, no clock, no randomness,
// so the same orders and settings always give the same plan, and it is unit-tested in isolation.
//
// Model: one run = one Grab car trip from the kitchen. The car leaves so that it reaches the first
// stop exactly at the window start, then drives stop to stop (open route; the driver doesn't come
// back). Distance = straight line × road factor; time = distance / average speed + service time.
//
// 1. Sweep clustering: stops sorted by angle around the kitchen, filled into a run until the car is
//    full or a stop would arrive after the window ends; tried from many starting angles, keeping the
//    plan with the fewest late stops, then fewest cars, then fewest km.
// 2. Within a run: nearest neighbour, then 2-opt, with lateness penalised heavily.

import { angleAround, haversineKm, type LatLng } from "./geo.ts";

export type RoutingStop = { id: string; lat: number; lng: number; load: number };

/** Dispatcher rules (also the AI copilot's output schema). Times are epoch ms. */
export type RoutingConstraints = {
  deadlines?: { orderId: string; by: number }[];
  firstStop?: string[];
  lastStop?: string[];
  sameRun?: string[][];
  separateRuns?: string[][];
  maxRuns?: number;
  capacityOverride?: number;
};

export type RoutingParams = {
  depot: LatLng;
  windowStart: number; // epoch ms
  windowEnd: number; // epoch ms
  vehicleCapacity: number; // load units per car
  serviceMinutes: number; // per stop
  speedKmh: number;
  roadFactor: number;
};

export type PlannedStop = { id: string; eta: number; legKm: number; late: boolean };

export type PlannedRun = {
  stops: PlannedStop[];
  load: number;
  departure: number; // epoch ms
  km: number;
  durationMin: number; // departure → last handover done
  lastEta: number; // epoch ms
};

export type PlanMetrics = {
  cars: number;
  stops: number;
  totalKm: number;
  lateStops: number;
  onTimePct: number; // 0–100
  finishBy: number | null; // last ETA, epoch ms
};

export type Plan = { runs: PlannedRun[]; metrics: PlanMetrics; warnings: string[] };

const MAX_SWEEP_STARTS = 40;
const LATE_PENALTY_KM_PER_MIN = 10; // one minute late "costs" as much as 10 extra km
const EPSILON = 1e-9;

type Ctx = {
  params: RoutingParams;
  capacity: number;
  serviceMs: number;
  msPerKm: number;
  due: Map<string, number>;
  first: Set<string>;
  last: Set<string>;
};

type Evaluation = { km: number; lateMs: number; lateCount: number; legs: number[]; etas: number[] };

function makeCtx(params: RoutingParams, constraints: RoutingConstraints = {}): Ctx {
  const due = new Map<string, number>();
  for (const { orderId, by } of constraints.deadlines ?? []) {
    due.set(orderId, Math.min(by, due.get(orderId) ?? Infinity));
  }
  const first = new Set(constraints.firstStop ?? []);
  return {
    params,
    capacity: constraints.capacityOverride ?? params.vehicleCapacity,
    serviceMs: params.serviceMinutes * 60_000,
    msPerKm: 3_600_000 / params.speedKmh,
    due,
    first,
    last: new Set((constraints.lastStop ?? []).filter((id) => !first.has(id))),
  };
}

const roadKm = (a: LatLng, b: LatLng, ctx: Ctx) => haversineKm(a, b) * ctx.params.roadFactor;
const dueBy = (id: string, ctx: Ctx) => Math.min(ctx.params.windowEnd, ctx.due.get(id) ?? Infinity);

/** Drive a path from the depot, arriving at the first stop at window start. */
function evaluate(path: RoutingStop[], ctx: Ctx): Evaluation {
  const legs: number[] = [];
  const etas: number[] = [];
  let prev: LatLng = ctx.params.depot;
  let time = ctx.params.windowStart;
  let km = 0;
  let lateMs = 0;
  let lateCount = 0;
  path.forEach((stop, i) => {
    const leg = roadKm(prev, stop, ctx);
    if (i > 0) time += ctx.serviceMs + leg * ctx.msPerKm;
    legs.push(leg);
    etas.push(time);
    km += leg;
    const over = time - dueBy(stop.id, ctx);
    if (over > 0) {
      lateMs += over;
      lateCount++;
    }
    prev = stop;
  });
  return { km, lateMs, lateCount, legs, etas };
}

const cost = (e: Evaluation) => e.km + (e.lateMs / 60_000) * LATE_PENALTY_KM_PER_MIN;

function nearestNeighbour(from: LatLng, stops: RoutingStop[], ctx: Ctx): RoutingStop[] {
  const left = [...stops];
  const path: RoutingStop[] = [];
  let here = from;
  while (left.length > 0) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (roadKm(here, left[i], ctx) < roadKm(here, left[best], ctx)) best = i;
    }
    const next = left[best];
    path.push(next);
    left.splice(best, 1);
    here = next;
  }
  return path;
}

/** Pinned first/last stops stay at the ends; the middle is ordered by nearest neighbour. */
function splitPinned(stops: RoutingStop[], ctx: Ctx) {
  const head = stops.filter((s) => ctx.first.has(s.id));
  const tail = stops.filter((s) => ctx.last.has(s.id));
  const middle = stops.filter((s) => !ctx.first.has(s.id) && !ctx.last.has(s.id));
  const from = head.length > 0 ? head[head.length - 1] : ctx.params.depot;
  return { head, tail, middle: nearestNeighbour(from, middle, ctx) };
}

function twoOpt(head: RoutingStop[], middle: RoutingStop[], tail: RoutingStop[], ctx: Ctx): RoutingStop[] {
  let best = middle;
  let bestCost = cost(evaluate([...head, ...best, ...tail], ctx));
  let improved = true;
  for (let pass = 0; improved && pass < 50; pass++) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const c = cost(evaluate([...head, ...candidate, ...tail], ctx));
        if (c < bestCost - EPSILON) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return [...head, ...best, ...tail];
}

/** Best stop order for one car. */
function sequence(stops: RoutingStop[], ctx: Ctx): RoutingStop[] {
  const { head, middle, tail } = splitPinned(stops, ctx);
  return twoOpt(head, middle, tail, ctx);
}

/** Late stops in the best order we can cheaply find (nearest neighbour first, 2-opt if needed). */
function lateCountOf(stops: RoutingStop[], ctx: Ctx): number {
  const { head, middle, tail } = splitPinned(stops, ctx);
  const quick = evaluate([...head, ...middle, ...tail], ctx).lateCount;
  return quick === 0 ? 0 : evaluate(twoOpt(head, middle, tail, ctx), ctx).lateCount;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------
type Unit = { stops: RoutingStop[]; load: number; angle: number; separate: number[] };

/** sameRun groups become one unit (they always travel together); everything else is a single stop. */
function buildUnits(stops: RoutingStop[], constraints: RoutingConstraints, depot: LatLng): Unit[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const parent = new Map(stops.map((s) => [s.id, s.id]));
  const root = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const r = root(p);
    parent.set(id, r);
    return r;
  };
  for (const group of constraints.sameRun ?? []) {
    const ids = group.filter((id) => byId.has(id));
    for (const id of ids.slice(1)) parent.set(root(id), root(ids[0]));
  }

  const separateOf = new Map<string, number[]>();
  (constraints.separateRuns ?? []).forEach((group, g) => {
    for (const id of group) if (byId.has(id)) separateOf.set(id, [...(separateOf.get(id) ?? []), g]);
  });

  const groups = new Map<string, RoutingStop[]>();
  for (const s of stops) groups.set(root(s.id), [...(groups.get(root(s.id)) ?? []), s]);

  return [...groups.values()].map((members) => {
    const centre = {
      lat: members.reduce((n, s) => n + s.lat, 0) / members.length,
      lng: members.reduce((n, s) => n + s.lng, 0) / members.length,
    };
    return {
      stops: members,
      load: members.reduce((n, s) => n + s.load, 0),
      angle: angleAround(depot, centre),
      separate: [...new Set(members.flatMap((s) => separateOf.get(s.id) ?? []))],
    };
  });
}

/** Fill cars in sweep order. respectTime=false packs by capacity only (used to honour maxRuns). */
function sweep(order: Unit[], ctx: Ctx, respectTime: boolean): RoutingStop[][] {
  const runs: RoutingStop[][] = [];
  let current: RoutingStop[] = [];
  let load = 0;
  let late = 0;
  let separate = new Set<number>();

  for (const unit of order) {
    let fits =
      current.length === 0 ||
      (load + unit.load <= ctx.capacity + EPSILON && !unit.separate.some((g) => separate.has(g)));
    let lateAfter = late;
    if (fits && respectTime) {
      lateAfter = lateCountOf([...current, ...unit.stops], ctx);
      // A unit that is late even on its own may start a run; otherwise adding must not make anyone late.
      if (current.length > 0 && lateAfter > late) fits = false;
    }
    if (!fits) {
      runs.push(current);
      current = [];
      load = 0;
      separate = new Set();
      lateAfter = respectTime ? lateCountOf(unit.stops, ctx) : 0;
    }
    current.push(...unit.stops);
    load += unit.load;
    late = lateAfter;
    for (const g of unit.separate) separate.add(g);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

// ---------------------------------------------------------------------------
// Plan assembly
// ---------------------------------------------------------------------------
function toRun(path: RoutingStop[], ctx: Ctx): PlannedRun {
  const e = evaluate(path, ctx);
  const firstLeg = e.legs[0] ?? 0;
  const departure = ctx.params.windowStart - firstLeg * ctx.msPerKm;
  const lastEta = e.etas[e.etas.length - 1] ?? ctx.params.windowStart;
  return {
    stops: path.map((s, i) => ({ id: s.id, eta: e.etas[i], legKm: e.legs[i], late: e.etas[i] > dueBy(s.id, ctx) })),
    load: path.reduce((n, s) => n + s.load, 0),
    departure,
    km: e.km,
    durationMin: Math.round((lastEta + ctx.serviceMs - departure) / 60_000),
    lastEta,
  };
}

/** Share of stops on time, 0–100 (100 when there are no stops). */
export const onTimePct = (stops: number, lateStops: number) =>
  stops === 0 ? 100 : Math.round(((stops - lateStops) * 100) / stops);

function metricsOf(runs: PlannedRun[]): PlanMetrics {
  const used = runs.filter((r) => r.stops.length > 0);
  const stops = used.reduce((n, r) => n + r.stops.length, 0);
  const lateStops = used.reduce((n, r) => n + r.stops.filter((s) => s.late).length, 0);
  return {
    cars: used.length,
    stops,
    totalKm: used.reduce((n, r) => n + r.km, 0),
    lateStops,
    onTimePct: onTimePct(stops, lateStops),
    finishBy: used.length === 0 ? null : Math.max(...used.map((r) => r.lastEta)),
  };
}

/** Lower is better: late stops, then cars, then km. */
const score = (m: PlanMetrics) => [m.lateStops, m.cars, m.totalKm];
function better(a: PlanMetrics, b: PlanMetrics): boolean {
  const [x, y] = [score(a), score(b)];
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i] - y[i]) > EPSILON) return x[i] < y[i];
  }
  return false;
}

function bestSweep(units: Unit[], ctx: Ctx, respectTime: boolean): PlannedRun[] {
  const sorted = [...units].sort((a, b) => a.angle - b.angle || a.stops[0].id.localeCompare(b.stops[0].id));
  const starts = Math.min(sorted.length, MAX_SWEEP_STARTS);
  let best: { runs: PlannedRun[]; metrics: PlanMetrics } | null = null;
  for (let k = 0; k < starts; k++) {
    const offset = Math.floor((k * sorted.length) / starts);
    const order = [...sorted.slice(offset), ...sorted.slice(0, offset)];
    const runs = sweep(order, ctx, respectTime).map((stops) => toRun(sequence(stops, ctx), ctx));
    const metrics = metricsOf(runs);
    if (!best || better(metrics, best.metrics)) best = { runs, metrics };
  }
  return best?.runs ?? [];
}

function constraintWarnings(stops: RoutingStop[], constraints: RoutingConstraints, ctx: Ctx): string[] {
  const known = new Set(stops.map((s) => s.id));
  const mentioned = [
    ...(constraints.deadlines ?? []).map((d) => d.orderId),
    ...(constraints.firstStop ?? []),
    ...(constraints.lastStop ?? []),
    ...(constraints.sameRun ?? []).flat(),
    ...(constraints.separateRuns ?? []).flat(),
  ];
  const warnings: string[] = [];
  const unknown = [...new Set(mentioned.filter((id) => !known.has(id)))];
  if (unknown.length > 0) warnings.push(`Ignored rules for ${unknown.length} order(s) not in this slot.`);
  const oversized = stops.filter((s) => s.load > ctx.capacity + EPSILON).length;
  if (oversized > 0) warnings.push(`${oversized} order(s) are each more than one car can carry.`);
  return warnings;
}

/** Plan the fewest on-time runs for one delivery slot. */
export function optimise(stops: RoutingStop[], params: RoutingParams, constraints: RoutingConstraints = {}): Plan {
  const ctx = makeCtx(params, constraints);
  const warnings = constraintWarnings(stops, constraints, ctx);
  if (stops.length === 0) return { runs: [], metrics: metricsOf([]), warnings };

  const units = buildUnits(stops, constraints, params.depot);
  let runs = bestSweep(units, ctx, true);

  const { maxRuns } = constraints;
  if (maxRuns !== undefined && runs.length > maxRuns) {
    // Fewer cars than the on-time plan needs: pack by capacity and accept late stops.
    const packed = bestSweep(units, ctx, false);
    if (packed.length < runs.length) runs = packed;
    if (runs.length > maxRuns) warnings.push(`Needs at least ${runs.length} cars to carry everything; ${maxRuns} is not enough.`);
  }

  const metrics = metricsOf(runs);
  if (metrics.lateStops > 0) warnings.push(`${metrics.lateStops} stop(s) will arrive after the delivery window.`);
  return { runs, metrics, warnings };
}

/**
 * The manual way, for comparison (docs/ARCHITECTURE.md §5): orders chunked in the sequence given (order code),
 * unsorted — a new car only when the current one is full — and stops visited in that same order.
 */
export function baseline(stops: RoutingStop[], params: RoutingParams): Plan {
  const ctx = makeCtx(params);
  const groups: RoutingStop[][] = [];
  let current: RoutingStop[] = [];
  let load = 0;
  for (const stop of stops) {
    if (current.length > 0 && load + stop.load > ctx.capacity + EPSILON) {
      groups.push(current);
      current = [];
      load = 0;
    }
    current.push(stop);
    load += stop.load;
  }
  if (current.length > 0) groups.push(current);
  const runs = groups.map((g) => toRun(g, ctx));
  return { runs, metrics: metricsOf(runs), warnings: [] };
}

/** Run-membership rules a fixed grouping breaks (the dispatcher's manual choice wins; we only warn). */
function membershipWarnings(groups: RoutingStop[][], constraints: RoutingConstraints): string[] {
  const runOf = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((s) => runOf.set(s.id, i)));
  const runsOf = (ids: string[]) => ids.filter((id) => runOf.has(id)).map((id) => runOf.get(id)!);

  const warnings: string[] = [];
  const split = (constraints.sameRun ?? []).filter((g) => new Set(runsOf(g)).size > 1).length;
  if (split > 0) warnings.push(`${split} "same car" rule(s) are broken by this move.`);
  const shared = (constraints.separateRuns ?? []).filter((g) => {
    const runs = runsOf(g);
    return new Set(runs).size < runs.length;
  }).length;
  if (shared > 0) warnings.push(`${shared} "separate cars" rule(s) are broken by this move.`);
  const cars = groups.filter((g) => g.length > 0).length;
  if (constraints.maxRuns !== undefined && cars > constraints.maxRuns) {
    warnings.push(`This plan uses ${cars} cars; the limit is ${constraints.maxRuns}.`);
  }
  return warnings;
}

/**
 * Re-plan runs whose membership is fixed (after the dispatcher moves a stop): order and time each
 * one under the same rules as optimise() (deadlines, first/last stop, capacity override).
 * runs[i] belongs to groups[i]; an empty group gives an empty run.
 */
export function sequenceRuns(groups: RoutingStop[][], params: RoutingParams, constraints: RoutingConstraints = {}): Plan {
  const ctx = makeCtx(params, constraints);
  const runs = groups.map((g) => toRun(sequence(g, ctx), ctx));
  const metrics = metricsOf(runs);
  const warnings = membershipWarnings(groups, constraints);
  if (metrics.lateStops > 0) warnings.push(`${metrics.lateStops} stop(s) will arrive after the delivery window.`);
  for (const run of runs) {
    if (run.load > ctx.capacity + EPSILON) warnings.push("A run is loaded beyond one car's capacity.");
  }
  return { runs, metrics, warnings };
}
