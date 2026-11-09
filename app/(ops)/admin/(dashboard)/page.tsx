import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDaySummary } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { BUSINESS_TIMEZONE } from "@/lib/config";
import { formatMoney, formatServiceDate, formatWindow, toCents } from "@/lib/format";
import { isDateString, todayIn } from "@/lib/time";
import { CapacityBar } from "@/components/ops/capacity-bar";
import { DayNav } from "@/components/ops/day-nav";
import { PageHeader, PageSkeleton } from "@/components/ops/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Overview" };

type SearchParams = Promise<{ date?: string }>;

export default function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const today = todayIn(BUSINESS_TIMEZONE);
  const date = isDateString(params.date) ? params.date : today;
  const slots = await getDaySummary(db, date);

  const orders = slots.reduce((n, s) => n + s.active_orders, 0);
  const ribsBooked = slots.reduce((n, s) => n + s.ribs_booked, 0);
  const ribCapacity = slots.reduce((n, s) => n + s.rib_capacity, 0);
  const revenueCents = slots.reduce((n, s) => n + toCents(s.revenue), 0);
  const openSlots = slots.filter((s) => s.is_open).length;

  return (
    <>
      <PageHeader
        title={formatServiceDate(date, { withYear: true })}
        description={`${date === today ? "Today · " : ""}Orders, smoker capacity and revenue per delivery slot`}
      >
        <DayNav basePath="/admin" date={date} today={today} peakLabel="Peak day: 24 Dec 2025" />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Orders" value={String(orders)} sub={`${slots.length} delivery ${slots.length === 1 ? "slot" : "slots"}`} />
        <Kpi
          label="Ribs booked"
          value={`${ribsBooked} / ${ribCapacity}`}
          sub={ribCapacity > 0 ? `${Math.round((ribsBooked * 100) / ribCapacity)}% of smoker capacity` : "No capacity set"}
        />
        <Kpi label="Revenue" value={formatMoney(revenueCents)} sub="Incl. delivery and GST" />
        <Kpi label="Open slots" value={`${openSlots} / ${slots.length}`} sub="Taking new orders" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery slots</CardTitle>
          <CardDescription>Cancelled orders are excluded from counts and revenue.</CardDescription>
        </CardHeader>
        {/* Rows run edge to edge; the first and last columns take the card's 16px padding. */}
        <CardContent className="px-0">
          {slots.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No delivery slots on this day</EmptyTitle>
                <EmptyDescription>Jett delivers Fri–Sun, and daily over Christmas.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Ribs booked</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map((slot) => (
                  <TableRow key={slot.slot_id} className="h-11">
                    <TableCell className="pl-4 font-medium tabular-nums">{formatWindow(slot.window_start, slot.window_end)}</TableCell>
                    <TableCell>
                      {slot.is_open ? <Badge variant="success">Open</Badge> : <Badge variant="outline">Closed</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {slot.active_orders}
                      {slot.cancelled_orders > 0 && (
                        <span className="text-muted-foreground"> (+{slot.cancelled_orders} cancelled)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <CapacityBar used={slot.ribs_booked} capacity={slot.rib_capacity} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(toCents(slot.revenue))}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button asChild variant="link" className="h-auto p-0">
                        <Link href={`/admin/orders?date=${date}`}>View orders</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
