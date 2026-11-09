import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { decodeCursor, listOrders, ORDER_STATUSES, ORDERS_PAGE_SIZE, type OrderStatus } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { formatDateOf, formatMoney, formatServiceDate, formatWindow, toCents } from "@/lib/format";
import { isDateString } from "@/lib/time";
import { OrderStatusBadge } from "@/components/ops/order-status-badge";
import { PageHeader, PageSkeleton } from "@/components/ops/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusSelect } from "./status-select";

export const metadata: Metadata = { title: "Orders" };

type SearchParams = Promise<{ status?: string; date?: string; q?: string; after?: string; before?: string; page?: string }>;

export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireAdmin();
  const params = await searchParams;

  // URL input is untrusted: keep only well-formed filters.
  const status = ORDER_STATUSES.includes(params.status as OrderStatus) ? (params.status as OrderStatus) : undefined;
  const date = isDateString(params.date) ? params.date : undefined;
  const q = params.q?.trim().slice(0, 20) || undefined;
  const after = decodeCursor(params.after);
  const before = after ? undefined : decodeCursor(params.before);

  const { rows, total, prevCursor, nextCursor } = await listOrders(db, { status, date, q, after, before });

  // The page number only labels "Showing 51–100"; the cursors do the paging. With no newer orders this is page 1.
  const requestedPage = Number(params.page);
  const page = !prevCursor ? 1 : Number.isInteger(requestedPage) && requestedPage >= 2 ? requestedPage : 2;
  const firstShown = (page - 1) * ORDERS_PAGE_SIZE + 1;
  const lastShown = firstShown + rows.length - 1;

  const filterQuery = new URLSearchParams();
  if (status) filterQuery.set("status", status);
  if (date) filterQuery.set("date", date);
  if (q) filterQuery.set("q", q);
  const pageHref = (key: "after" | "before", cursor: string, toPage: number) => {
    if (toPage === 1) return `/admin/orders${filterQuery.size ? `?${filterQuery}` : ""}`;
    const next = new URLSearchParams(filterQuery);
    next.set(key, cursor);
    next.set("page", String(toPage));
    return `/admin/orders?${next}`;
  };
  const filtered = Boolean(status || date || q);

  return (
    <>
      <PageHeader title="Orders" description="Newest first. Search by order code (e.g. JB100001) or postal code." />

      {/* Keyed by the filters so "Clear" also empties the uncontrolled inputs. */}
      <form key={filterQuery.toString()} action="/admin/orders" className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={q} placeholder="Order code or postal code" aria-label="Search" className="h-8 w-56" />
        <Input type="date" name="date" defaultValue={date} aria-label="Delivery date" className="h-8 w-40" />
        <StatusSelect defaultValue={status} />
        <Button type="submit">Filter</Button>
        {filtered && (
          <Button asChild variant="ghost">
            <Link href="/admin/orders">Clear</Link>
          </Button>
        )}
      </form>

      <Card className="py-0">
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No orders found</EmptyTitle>
                <EmptyDescription>{filtered ? "Try different filters." : "Orders will appear here."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="pl-4">Order</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Postal code</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((order) => (
                  <TableRow key={order.id} className="h-11">
                    <TableCell className="pl-4">
                      <Link href={`/admin/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                        {order.code}
                      </Link>
                      {order.source === "import" && (
                        <Badge variant="outline" className="ml-2">
                          Imported
                        </Badge>
                      )}
                      {order.is_zero_value && (
                        <Badge variant="outline" className="ml-2">
                          $0 order
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatServiceDate(order.delivery_slots.service_date)},{" "}
                      {formatWindow(order.delivery_slots.window_start, order.delivery_slots.window_end)}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{order.customer_name}</TableCell>
                    <TableCell className="tabular-nums">{order.postal_code}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(toCents(order.total))}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground tabular-nums">{formatDateOf(order.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground tabular-nums">
            Showing {firstShown.toLocaleString("en-SG")}–{lastShown.toLocaleString("en-SG")} of{" "}
            {total.toLocaleString("en-SG")} {total === 1 ? "order" : "orders"}
          </p>
          <div className="flex items-center gap-2">
            {prevCursor ? (
              <Button asChild variant="outline">
                <Link href={pageHref("before", prevCursor, page - 1)}>
                  <ChevronLeftIcon data-icon="inline-start" />
                  Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <ChevronLeftIcon data-icon="inline-start" />
                Previous
              </Button>
            )}
            {nextCursor ? (
              <Button asChild variant="outline">
                <Link href={pageHref("after", nextCursor, page + 1)}>
                  Next
                  <ChevronRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Next
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
