import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseline, optimise, sequenceRuns, type Plan, type RoutingParams, type RoutingStop } from "./optimise.ts";

const DEPOT = { lat: 1.3521, lng: 103.8198 };
const START = Date.UTC(2025, 11, 24, 9, 0); // 24 Dec 2025, 5:00 PM Singapore
const PARAMS: RoutingParams = {
  depot: DEPOT,
  windowStart: START,
  windowEnd: START + 90 * 60_000,
  vehicleCapacity: 10,
  serviceMinutes: 6,
  speedKmh: 30,
  roadFactor: 1.4,
};

const stop = (id: string, dLat: number, dLng: number, load = 1): RoutingStop => ({
  id,
  lat: DEPOT.lat + dLat,
  lng: DEPOT.lng + dLng,
  load,
});

/** n stops on a ring of `radius` degrees around the depot, in a scrambled (but fixed) order. */
function ring(n: number, radius: number): RoutingStop[] {
  const stops = Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return stop(`r${i}`, radius * Math.sin(a), radius * Math.cos(a));
  });
  let seed = 42; // tiny LCG so the order is shuffled but reproducible
  const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  return stops.sort(() => rand() - 0.5);
}

/** 16 stops a few hundred metres apart: 15 × 6 min service alone overruns a 90-minute window. */
const cluster = (n = 16) => Array.from({ length: n }, (_, i) => stop(`c${i}`, 0.001 * (i % 4), 0.001 * Math.floor(i / 4)));

const idsOf = (plan: Plan) => plan.runs.map((r) => r.stops.map((s) => s.id));
const runOf = (plan: Plan, id: string) => idsOf(plan).findIndex((ids) => ids.includes(id));

function assertEveryStopOnce(plan: Plan, stops: RoutingStop[]) {
  const planned = idsOf(plan).flat().sort();
  assert.deepEqual(planned, stops.map((s) => s.id).sort());
}

describe("optimise", () => {
  it("returns an empty plan for no stops", () => {
    const plan = optimise([], PARAMS);
    assert.equal(plan.runs.length, 0);
    assert.equal(plan.metrics.cars, 0);
    assert.equal(plan.metrics.finishBy, null);
  });

  it("never loads a car beyond capacity and plans every stop exactly once", () => {
    const stops = ring(25, 0.02);
    const plan = optimise(stops, PARAMS);
    assertEveryStopOnce(plan, stops);
    assert.equal(plan.metrics.cars, 3);
    for (const run of plan.runs) assert.ok(run.load <= PARAMS.vehicleCapacity);
  });

  it("adds a car when one car can't finish inside the window", () => {
    const stops = cluster();
    const plan = optimise(stops, { ...PARAMS, vehicleCapacity: 100 });
    assertEveryStopOnce(plan, stops);
    assert.equal(plan.metrics.cars, 2);
    assert.equal(plan.metrics.lateStops, 0);
    assert.equal(plan.metrics.onTimePct, 100);
  });

  it("visits stops on a line in distance order, arriving at the first stop at window start", () => {
    const stops = [3, 1, 5, 2, 4].map((k) => stop(`k${k}`, 0, 0.01 * k));
    const plan = optimise(stops, PARAMS);
    assert.deepEqual(idsOf(plan), [["k1", "k2", "k3", "k4", "k5"]]);

    const [run] = plan.runs;
    assert.equal(run.stops[0].eta, START);
    const firstLegMinutes = (run.stops[0].legKm / PARAMS.speedKmh) * 60;
    assert.ok(Math.abs(run.departure - (START - firstLegMinutes * 60_000)) < 1);
    // Open route: total km is just the way out (≈ 5 × 1.11 km × 1.4), no return leg.
    assert.ok(Math.abs(run.km - 7.78) < 0.1, `km was ${run.km}`);
  });

  it("beats the order-sequence baseline on km without using more cars", () => {
    const stops = ring(30, 0.05);
    const optimised = optimise(stops, PARAMS);
    const manual = baseline(stops, PARAMS);
    assertEveryStopOnce(manual, stops);
    assert.ok(optimised.metrics.totalKm < manual.metrics.totalKm * 0.8, "expected at least 20% fewer km");
    assert.ok(optimised.metrics.cars <= manual.metrics.cars);
  });
});

describe("constraints", () => {
  it("deadline: a far stop due at window start is delivered first", () => {
    const stops = [1, 2, 3].map((k) => stop(`k${k}`, 0, 0.01 * k));
    const plan = optimise(stops, PARAMS, { deadlines: [{ orderId: "k3", by: START }] });
    assert.equal(plan.runs[0].stops[0].id, "k3");
    assert.equal(plan.metrics.lateStops, 0);
  });

  it("firstStop and lastStop pin the ends of the run", () => {
    const stops = [1, 2, 3, 4].map((k) => stop(`k${k}`, 0, 0.01 * k));
    const plan = optimise(stops, PARAMS, { firstStop: ["k3"], lastStop: ["k1"] });
    const [ids] = idsOf(plan);
    assert.equal(ids[0], "k3");
    assert.equal(ids[ids.length - 1], "k1");
  });

  it("sameRun keeps orders on opposite sides of the kitchen together", () => {
    const stops = ring(20, 0.02);
    const plan = optimise(stops, { ...PARAMS, vehicleCapacity: 5 }, { sameRun: [["r0", "r10"]] });
    assertEveryStopOnce(plan, stops);
    assert.equal(runOf(plan, "r0"), runOf(plan, "r10"));
  });

  it("separateRuns splits neighbours", () => {
    const stops = [stop("a", 0.01, 0.01), stop("b", 0.0101, 0.01), stop("c", 0.0102, 0.01)];
    const plan = optimise(stops, PARAMS, { separateRuns: [["a", "b"]] });
    assert.notEqual(runOf(plan, "a"), runOf(plan, "b"));
  });

  it("capacityOverride changes how much each car carries", () => {
    const plan = optimise(ring(12, 0.02), PARAMS, { capacityOverride: 4 });
    assert.equal(plan.metrics.cars, 3);
  });

  it("maxRuns trades lateness for fewer cars, and warns", () => {
    const plan = optimise(cluster(), { ...PARAMS, vehicleCapacity: 100 }, { maxRuns: 1 });
    assert.equal(plan.metrics.cars, 1);
    assert.ok(plan.metrics.lateStops > 0);
    assert.ok(plan.warnings.some((w) => w.includes("after the delivery window")));
  });

  it("maxRuns below what capacity allows is reported, not silently broken", () => {
    const plan = optimise(ring(25, 0.02), PARAMS, { maxRuns: 2 });
    assert.equal(plan.metrics.cars, 3);
    assert.ok(plan.warnings.some((w) => w.includes("at least 3 cars")));
  });

  it("rules for unknown orders are ignored with a warning", () => {
    const plan = optimise([stop("a", 0.01, 0)], PARAMS, { firstStop: ["nope"] });
    assert.equal(plan.metrics.cars, 1);
    assert.ok(plan.warnings.some((w) => w.includes("not in this slot")));
  });
});

describe("baseline", () => {
  it("chunks stops in the given order by capacity only, even when that makes stops late", () => {
    const stops = cluster(); // 16 stops: one car can't serve them all inside the window
    const plan = baseline(stops, { ...PARAMS, vehicleCapacity: 100 });
    assert.deepEqual(idsOf(plan), [stops.map((s) => s.id)]);
    assert.ok(plan.metrics.lateStops > 0);
  });

  it("opens a new car exactly when the next stop wouldn't fit", () => {
    const stops = [1, 2, 3, 4, 5].map((k) => stop(`k${k}`, 0, 0.01 * k, 4));
    assert.deepEqual(idsOf(baseline(stops, PARAMS)), [["k1", "k2"], ["k3", "k4"], ["k5"]]);
  });
});

describe("sequenceRuns", () => {
  it("keeps each run's stops, re-orders them, and keeps empty runs in place", () => {
    const groups = [[stop("x2", 0, 0.02), stop("x1", 0, 0.01)], [], [stop("y1", 0.01, 0)]];
    const plan = sequenceRuns(groups, PARAMS);
    assert.deepEqual(idsOf(plan), [["x1", "x2"], [], ["y1"]]);
    assert.equal(plan.metrics.cars, 2);
  });

  it("honours deadlines and pinned stops after a manual move", () => {
    const run = [1, 2, 3, 4].map((k) => stop(`k${k}`, 0, 0.01 * k));
    const plan = sequenceRuns([run], PARAMS, { deadlines: [{ orderId: "k4", by: START }], lastStop: ["k1"] });
    const [ids] = idsOf(plan);
    assert.equal(ids[0], "k4");
    assert.equal(ids[ids.length - 1], "k1");
    assert.equal(plan.metrics.lateStops, 0);
  });

  it("judges capacity by the override and warns about broken run-membership rules", () => {
    const groups = [[stop("a", 0, 0.01, 3), stop("b", 0, 0.02, 3)], [stop("c", 0.01, 0)]];
    const plan = sequenceRuns(groups, PARAMS, {
      capacityOverride: 5,
      sameRun: [["a", "c"]],
      separateRuns: [["a", "b"]],
      maxRuns: 1,
    });
    assert.ok(plan.warnings.some((w) => w.includes("beyond one car's capacity")));
    assert.ok(plan.warnings.some((w) => w.includes('"same car"')));
    assert.ok(plan.warnings.some((w) => w.includes('"separate cars"')));
    assert.ok(plan.warnings.some((w) => w.includes("the limit is 1")));
  });
});
