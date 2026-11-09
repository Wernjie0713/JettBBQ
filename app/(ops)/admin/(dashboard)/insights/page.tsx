import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { formatMoney, formatServiceDate } from "@/lib/format";
import { briefingInput, briefingKey, getBriefing, getInsights, GROWTH_OPTIONS, LAST_SEASON, NEXT_SEASON } from "@/lib/insights";
import { cn } from "@/lib/utils";
import { PageHeader, PageSkeleton } from "@/components/ops/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BriefingCard } from "./briefing-card";
import { OrdersByDayChart, OrdersByWindowChart } from "./charts";

export const metadata: Metadata = { title: "Insights" };

type SearchParams = Promise<{ growth?: string }>;

export default function InsightsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InsightsView searchParams={searchParams} />
    </Suspense>
  );
}

async function InsightsView({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const requested = Number(params.growth);
  const growthPct = GROWTH_OPTIONS.find((g) => g === requested) ?? 0;

  const insights = await getInsights(db, growthPct);
  const briefing = await getBriefing(db, briefingKey(briefingInput(insights)));
  const { last, next } = insights;
  const maxArea = insights.areas[0]?.orders ?? 1;

  return (
    <>
      <PageHeader
        title="Insights"
        description={`${LAST_SEASON.label} demand, and what it means for ${NEXT_SEASON.label}`}
      >
        <span className="text-sm text-muted-foreground">Assumed growth</span>
        <nav aria-label="Assumed growth" className="flex gap-1">
          {GROWTH_OPTIONS.map((g) => (
            <Link
              key={g}
              href={`/admin/insights?growth=${g}`}
              aria-current={g === growthPct ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-md border px-3 text-sm tabular-nums hover:bg-muted",
                g === growthPct && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {g === 0 ? "Same as 2025" : `+${g}%`}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Orders, ${LAST_SEASON.label}`} value={String(last.orders)} sub={`${formatMoney(last.revenueCents)} · ${last.ribs} ribs`} />
        <Kpi
          label="Busiest day"
          value={last.peakDay ? formatServiceDate(last.peakDay.date) : "—"}
          sub={last.peakDay ? `${last.peakDay.orders} orders` : ""}
        />
        <Kpi
          label={`Booked for ${NEXT_SEASON.label}`}
          value={String(next.bookedSoFar)}
          sub={`Same date last year: ${last.bookedAtThisPoint}`}
        />
        <Kpi
          label="Forecast orders"
          value={String(next.forecastOrders)}
          sub={growthPct === 0 ? "If demand matches 2025" : `2025 + ${growthPct}%`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders per delivery day</CardTitle>
            <CardDescription>{LAST_SEASON.label}, excluding cancelled orders</CardDescription>
          </CardHeader>
          <CardContent>
            <OrdersByDayChart data={insights.byDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Orders by delivery window</CardTitle>
            <CardDescription>All of {LAST_SEASON.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <OrdersByWindowChart data={insights.byWindow} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cars to pre-book for the peak slots</CardTitle>
          <CardDescription>
            Cars come from the route optimiser run on last year&apos;s real orders with today&apos;s settings (
            {insights.carCapacity} boxes per car), and again with the assumed growth added as extra orders to
            the same areas.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Slot (2025)</TableHead>
                <TableHead className="text-right">Orders 2025</TableHead>
                <TableHead className="text-right">Cars 2025</TableHead>
                <TableHead className="text-right">Forecast orders</TableHead>
                <TableHead className="text-right">Cars to pre-book</TableHead>
                <TableHead className="pr-4">Ribs vs 2026 capacity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {insights.peaks.map((p) => (
                <TableRow key={`${p.date}-${p.window}`} className="h-11 tabular-nums">
                  <TableCell className="pl-4 font-medium">
                    {formatServiceDate(p.date)}, {p.window}
                  </TableCell>
                  <TableCell className="text-right">{p.orders2025}</TableCell>
                  <TableCell className="text-right">
                    {p.cars2025} <span className="text-muted-foreground">({p.km2025} km)</span>
                  </TableCell>
                  <TableCell className="text-right">{p.orders2026}</TableCell>
                  <TableCell className="text-right font-bold">{p.cars2026}</TableCell>
                  <TableCell className="pr-4">
                    {p.ribCapacity2026 === null ? (
                      <Badge variant="warning">No 2026 slot yet</Badge>
                    ) : p.ribs2026 > p.ribCapacity2026 ? (
                      <Badge variant="destructive">
                        {p.ribs2026} / {p.ribCapacity2026} · sells out
                      </Badge>
                    ) : (
                      <span>
                        {p.ribs2026} / {p.ribCapacity2026}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <BriefingCard briefing={briefing} growthPct={growthPct} />
        <Card>
          <CardHeader>
            <CardTitle>Where orders go</CardTitle>
            <CardDescription>Top areas by postal district, {LAST_SEASON.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2">
              {insights.areas.map((a) => (
                <li key={a.area} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span className="truncate">{a.area}</span>
                  <span className="tabular-nums">{a.orders}</span>
                  <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-chart-1" style={{ width: `${(a.orders * 100) / maxArea}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
        <p className="text-[28px] leading-tight font-bold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
