import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDaySummary, getSettings } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { BUSINESS_TIMEZONE } from "@/lib/config";
import { getDispatchOrders, getRuns, routableStops, routingParams } from "@/lib/dispatch";
import { formatServiceDate, formatWindow } from "@/lib/format";
import { baseline } from "@/lib/routing/optimise";
import { isDateString, todayIn } from "@/lib/time";
import { DayNav } from "@/components/ops/day-nav";
import { PageHeader, PageSkeleton } from "@/components/ops/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { DispatchBoard, type BaselineMetrics } from "./dispatch-board";

export const metadata: Metadata = { title: "Dispatch" };

type SearchParams = Promise<{ date?: string; slot?: string }>;

export default function DispatchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dispatch searchParams={searchParams} />
    </Suspense>
  );
}

async function Dispatch({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const today = todayIn(BUSINESS_TIMEZONE);
  const date = isDateString(params.date) ? params.date : today;
  const slots = await getDaySummary(db, date);
  // Default to the busiest slot of the day.
  const slot =
    slots.find((s) => s.slot_id === params.slot) ??
    [...slots].sort((a, b) => b.active_orders - a.active_orders)[0];

  const header = (
    <PageHeader
      title="Dispatch"
      description={slot ? `${formatServiceDate(date, { withYear: true })} · ${formatWindow(slot.window_start, slot.window_end)}` : formatServiceDate(date, { withYear: true })}
    >
      <DayNav basePath="/admin/dispatch" date={date} peakLabel="Peak: 24 Dec 2025" />
    </PageHeader>
  );

  if (!slot) {
    return (
      <>
        {header}
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No delivery slots on this day</EmptyTitle>
            <EmptyDescription>Pick another date. Jett delivers Fri–Sun, and daily over Christmas.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  const [settings, orders, runs] = await Promise.all([
    getSettings(db),
    getDispatchOrders(db, slot.slot_id),
    getRuns(db, slot.slot_id),
  ]);
  const routing = routingParams(settings, slot);

  // The manual way, for comparison: orders in the sequence they were placed. The saved plan's own
  // numbers are worked out in the board, which knows the copilot's deadline rules.
  const manual = baseline(routableStops(orders), routing);
  const baselineMetrics: BaselineMetrics = {
    cars: manual.metrics.cars,
    totalKm: manual.metrics.totalKm,
    lateStops: manual.metrics.lateStops,
  };

  return (
    <>
      {header}
      <nav aria-label="Delivery slot" className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <Link
            key={s.slot_id}
            href={`/admin/dispatch?date=${date}&slot=${s.slot_id}`}
            aria-current={s.slot_id === slot.slot_id ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm tabular-nums transition-colors hover:bg-muted",
              s.slot_id === slot.slot_id && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {formatWindow(s.window_start, s.window_end)}
            <span className={cn("text-muted-foreground", s.slot_id === slot.slot_id && "text-primary-foreground/80")}>
              {s.active_orders} {s.active_orders === 1 ? "order" : "orders"}
            </span>
          </Link>
        ))}
      </nav>

      <DispatchBoard
        key={slot.slot_id}
        slotId={slot.slot_id}
        serviceDate={date}
        windowEnd={slot.window_end}
        depot={routing.depot}
        depotName={settings.depot_name}
        capacity={routing.vehicleCapacity}
        orders={orders}
        runs={runs}
        baselineRuns={manual.runs.map((r) => r.stops.map((s) => s.id))}
        baseline={baselineMetrics}
      />
    </>
  );
}
