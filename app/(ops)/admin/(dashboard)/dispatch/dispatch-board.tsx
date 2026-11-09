"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { RouteIcon } from "lucide-react";
import { savedPlanNumbers, slotConstraints, type DispatchOrder, type DispatchRun, type SavedPlanNumbers } from "@/lib/dispatch";
import type { LatLng } from "@/lib/routing/geo";
import { onTimePct } from "@/lib/routing/optimise";
import { runColor } from "@/lib/run-colors";
import { formatTime } from "@/lib/format";
import { browserClient } from "@/lib/supabase/browser";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { EMPTY_RULES, type DispatchRules } from "@/lib/dispatch-rules";
import { moveStop, optimiseSlot, type DispatchActionResult } from "./actions";
import { CopilotPanel } from "./copilot-panel";
import type { MapRun, MapStop } from "./route-map";
import { MoveMenu, round1, RunCard } from "./run-card";

const RouteMap = dynamic(() => import("./route-map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export type BaselineMetrics = { cars: number; totalKm: number; lateStops: number };

/** Re-render from the server when a driver (or another admin) changes this slot's runs. */
function useLiveDispatch(slotId: string, runIds: string[]) {
  const router = useRouter();
  const runKey = runIds.join(",");
  const subscribedBefore = useRef(false);
  useEffect(() => {
    const db = browserClient();
    let timer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 400);
    };
    // Unique topic per subscription: removeChannel() is async, and supabase-js hands back a
    // still-closing channel if the same topic is requested again, which silently drops the new one.
    const channel = db
      .channel(`dispatch:${slotId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_runs", filter: `slot_id=eq.${slotId}` }, refreshSoon);
    if (runKey) {
      channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "run_stops", filter: `run_id=in.(${runKey})` }, refreshSoon);
    }
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        // Re-subscribing (back from another page, reconnect after a drop): catch up on missed changes.
        if (subscribedBefore.current) refreshSoon();
        subscribedBefore.current = true;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error("Dispatch live updates unavailable", status, error);
    });
    return () => {
      window.clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [slotId, runKey, router]);
}

export function DispatchBoard({
  slotId,
  serviceDate,
  windowEnd,
  depot,
  depotName,
  capacity,
  orders,
  runs,
  baselineRuns,
  baseline,
}: {
  slotId: string;
  serviceDate: string;
  windowEnd: string;
  depot: LatLng;
  depotName: string;
  capacity: number;
  orders: DispatchOrder[];
  runs: DispatchRun[];
  baselineRuns: string[][];
  baseline: BaselineMetrics;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [rules, setRules] = useState<DispatchRules>(EMPTY_RULES); // copilot rules, kept while on this slot
  const [busy, startTransition] = useTransition();
  useLiveDispatch(slotId, runs.map((r) => r.id));

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const plannedIds = new Set(runs.flatMap((r) => r.stops.map((s) => s.order_id)));
  const unplanned = orders.filter(
    (o) => !plannedIds.has(o.id) && o.lat !== null && (o.status === "confirmed" || o.status === "planned"),
  );
  const noAddress = orders.filter((o) => o.lat === null || o.lng === null);
  const locked = runs.some((r) => r.status === "in_progress" || r.status === "completed");
  const driversAssigned = runs.some((r) => r.driver_name);
  const hasPlan = runs.length > 0;
  // Late = after the window or a copilot deadline, the same test the optimiser plans against.
  const deadlines = useMemo(
    () => slotConstraints(rules, orders, serviceDate).constraints.deadlines ?? [],
    [rules, orders, serviceDate],
  );
  const planNumbers = savedPlanNumbers(runs, windowEnd, deadlines);

  const report = (result: DispatchActionResult) => {
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    for (const warning of result.warnings) toast.warning(warning);
  };
  const runOptimise = () =>
    startTransition(async () => {
      setSelected(null);
      report(await optimiseSlot(slotId, rules));
    });
  const onMove = (orderId: string, target: string) =>
    startTransition(async () => report(await moveStop({ slotId, orderId, target, rules })));

  const mapRuns = useMemo<MapRun[]>(() => {
    const point = (order: DispatchOrder | undefined, seq: number, extra: Partial<MapStop> = {}): MapStop[] =>
      order && order.lat !== null && order.lng !== null
        ? [{ id: order.id, lat: order.lat, lng: order.lng, seq, label: `${order.code} · ${order.postal_code}`, status: "pending", ...extra }]
        : [];
    if (compare) {
      return baselineRuns.map((ids, i) => ({
        id: `baseline-${i}`,
        number: i + 1,
        color: runColor(i + 1),
        stops: ids.flatMap((id, j) => point(orderById.get(id), j + 1)),
      }));
    }
    return runs.map((run) => ({
      id: run.id,
      number: run.run_number,
      color: run.color,
      stops: run.stops.flatMap((s) =>
        point(orderById.get(s.order_id), s.sequence, {
          status: s.status,
          detail: s.status === "pending" && s.eta ? `ETA ${formatTime(s.eta)}` : s.failure_reason ?? undefined,
        }),
      ),
    }));
  }, [compare, baselineRuns, runs, orderById]);

  const unplannedPoints = compare
    ? []
    : unplanned.map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, seq: 0, label: `${o.code} · ${o.postal_code}`, status: "pending" as const }));

  const optimiseButton = (
    <Button disabled={busy || locked} onClick={driversAssigned ? undefined : runOptimise}>
      {busy ? <Spinner data-icon="inline-start" /> : <RouteIcon data-icon="inline-start" />}
      {hasPlan ? "Re-optimise" : "Optimise routes"}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {driversAssigned && !locked ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>{optimiseButton}</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Re-plan this slot?</AlertDialogTitle>
                <AlertDialogDescription>
                  All runs are replaced. Driver names, phone numbers and plates are cleared, and driver links already
                  sent stop working.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep current plan</AlertDialogCancel>
                <AlertDialogAction onClick={runOptimise}>Re-optimise</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          optimiseButton
        )}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={compare} onCheckedChange={setCompare} />
          Show baseline routes on the map
        </label>
        {locked && <p className="text-sm text-muted-foreground">A run has started, so the plan is locked.</p>}
      </div>

      <MetricStrip plan={planNumbers} baseline={baseline} hasPlan={hasPlan} />

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:h-[calc(100svh-17rem)] xl:min-h-[560px] xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        {/* -mr-3 lets the scrollbar sit in the grid gap, so the cards keep about the same 16px gap
            to the map as the map has to the copilot. */}
        <div className="flex min-h-0 flex-col gap-3 [scrollbar-width:thin] *:shrink-0 lg:-mr-3 lg:max-h-[600px] lg:overflow-y-auto lg:pr-1 xl:max-h-none">
          {noAddress.length > 0 && (
            <Card className="gap-2 border-warning py-3">
              <CardHeader className="px-3">
                <CardTitle className="text-sm">Address needs checking ({noAddress.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-x-3 gap-y-1 px-3 text-sm">
                {noAddress.map((o) => (
                  <Link key={o.id} href={`/admin/orders/${o.id}`} className="underline underline-offset-4">
                    {o.code}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {unplanned.length > 0 && (
            <Card className="gap-2 py-3">
              <CardHeader className="px-3">
                <CardTitle className="text-sm">Not planned yet ({unplanned.length})</CardTitle>
              </CardHeader>
              <CardContent className="px-3">
                <ul className="flex flex-col divide-y rounded-md border">
                  {unplanned.slice(0, 50).map((o) => (
                    <li key={o.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{o.code}</span> · {o.postal_code}
                      </span>
                      {hasPlan && (
                        <MoveMenu
                          runs={runs}
                          currentRunId={null}
                          disabled={locked || busy}
                          onMove={(target) => onMove(o.id, target)}
                          label={`Add ${o.code} to a run`}
                        />
                      )}
                    </li>
                  ))}
                </ul>
                {!hasPlan && <p className="mt-2 text-sm text-muted-foreground">Press Optimise routes to plan them.</p>}
              </CardContent>
            </Card>
          )}

          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              runs={runs}
              orderById={orderById}
              capacity={rules.capacityOverride ?? capacity}
              windowEnd={windowEnd}
              deadlines={deadlines}
              selected={selected === run.id}
              locked={locked}
              busy={busy}
              onSelect={() => setSelected((current) => (current === run.id ? null : run.id))}
              onMove={onMove}
            />
          ))}
        </div>

        <div className="isolate h-[420px] overflow-hidden rounded-xl ring-1 ring-foreground/10 lg:h-[600px] xl:h-auto">
          <RouteMap
            depot={depot}
            depotName={depotName}
            runs={mapRuns}
            unplanned={unplannedPoints}
            selectedRunId={compare ? null : selected}
            onSelectRun={(id) => !compare && setSelected(id)}
            dashed={compare}
            fitKey={`${slotId}:${compare}`}
          />
        </div>

        <div className="flex min-h-[420px] flex-col *:flex-1 lg:col-span-2 xl:col-span-1 xl:min-h-0">
          <CopilotPanel slotId={slotId} rules={rules} onRulesChange={setRules} locked={locked} />
        </div>
      </div>
    </div>
  );
}

function MetricStrip({
  plan,
  baseline,
  hasPlan,
}: {
  plan: SavedPlanNumbers;
  baseline: BaselineMetrics;
  hasPlan: boolean;
}) {
  const kmSaved = baseline.totalKm - plan.totalKm;
  const carsSaved = baseline.cars - plan.cars;
  const lateSaved = baseline.lateStops - plan.lateStops;
  const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
  // Say it straight when the plan uses more cars than the baseline: that's the price of being on time.
  const carsLine = carsSaved >= 0 ? `${plural(carsSaved, "car")} fewer` : `${plural(-carsSaved, "car")} more`;
  const savedSub = lateSaved > 0 ? `${carsLine} · ${plural(lateSaved, "late stop")} fewer` : carsLine;
  const items = [
    {
      label: "Cars needed",
      value: hasPlan ? String(plan.cars) : "—",
      sub: `Baseline: ${baseline.cars}`,
    },
    {
      label: "Total km",
      value: hasPlan ? `${round1(plan.totalKm)} km` : "—",
      sub: `Baseline: ${round1(baseline.totalKm)} km`,
    },
    {
      label: "On time",
      value: plan.stops === 0 ? "—" : `${onTimePct(plan.stops, plan.lateStops)}%`,
      sub: hasPlan ? `${plan.lateStops} late of ${plan.stops} · baseline ${baseline.lateStops}` : `Baseline: ${baseline.lateStops} late`,
    },
    {
      label: "Saved vs baseline",
      value: hasPlan ? `${round1(kmSaved)} km` : "—",
      sub: hasPlan ? savedSub : "Optimise to compare",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="gap-1 py-3">
          <CardContent className="flex flex-col gap-0.5 px-4">
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{item.label}</p>
            <p className="text-2xl font-bold tabular-nums">{item.value}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{item.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
