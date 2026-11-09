import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { listSlots, type AdminSlot } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { BUSINESS_TIMEZONE } from "@/lib/config";
import { formatServiceDate, formatServiceDateRange } from "@/lib/format";
import { addDaysToDate, daysBetween, isDateString, todayIn } from "@/lib/time";
import { PageHeader, PageSkeleton } from "@/components/ops/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RangePicker } from "./range-picker";
import { SlotRow } from "./slot-row";

export const metadata: Metadata = { title: "Delivery slots" };

const DEFAULT_RANGE_DAYS = 14;
const MAX_RANGE_DAYS = 31; // keeps the page to ~100 slots

type SearchParams = Promise<{ from?: string; to?: string }>;

export default function SlotsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Slots searchParams={searchParams} />
    </Suspense>
  );
}

async function Slots({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const today = todayIn(BUSINESS_TIMEZONE);
  const from = isDateString(params.from) ? params.from : today;
  // URL input is untrusted: an end date before the start or past the cap falls back to two weeks.
  const requestedDays = isDateString(params.to) ? daysBetween(from, params.to) + 1 : 0;
  const days = requestedDays >= 1 && requestedDays <= MAX_RANGE_DAYS ? requestedDays : DEFAULT_RANGE_DAYS;
  const to = addDaysToDate(from, days - 1);
  const shifted = (by: number) => `/admin/slots?from=${addDaysToDate(from, by)}&to=${addDaysToDate(to, by)}`;
  const slots = await listSlots(db, from, to);

  const byDate = new Map<string, AdminSlot[]>();
  for (const slot of slots) byDate.set(slot.service_date, [...(byDate.get(slot.service_date) ?? []), slot]);

  return (
    <>
      <PageHeader
        title="Delivery slots"
        description="Rib capacity is how many beef ribs the smoker can supply per slot. Closed slots stop taking new orders."
      >
        <Button asChild variant="outline" size="icon" aria-label={`Previous ${days} days`}>
          <Link href={shifted(-days)}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <RangePicker from={from} to={to} maxDays={MAX_RANGE_DAYS} />
        <Button asChild variant="outline" size="icon" aria-label={`Next ${days} days`}>
          <Link href={shifted(days)}>
            <ChevronRightIcon />
          </Link>
        </Button>
        {from !== today && (
          <Button asChild variant="ghost">
            <Link href="/admin/slots">Today</Link>
          </Button>
        )}
      </PageHeader>

      {byDate.size === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No delivery slots in this range</EmptyTitle>
                <EmptyDescription>{formatServiceDateRange(from, to)}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        [...byDate].map(([date, daySlots]) => (
          <Card key={date} className="gap-2 pb-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {formatServiceDate(date)}
                {date === today && <span className="text-sm font-normal text-muted-foreground">Today</span>}
                {date < today && <span className="text-sm font-normal text-muted-foreground">Past · read only</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44 pl-4">Window</TableHead>
                    <TableHead className="w-64">Ribs booked</TableHead>
                    <TableHead>Rib capacity</TableHead>
                    <TableHead className="pr-4">New orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daySlots.map((slot) => (
                    <SlotRow key={slot.id} slot={slot} past={date < today} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}
