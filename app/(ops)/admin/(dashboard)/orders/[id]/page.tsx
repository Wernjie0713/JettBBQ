import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { getOrder } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { formatDateOf, formatMoney, formatServiceDate, formatTime, formatWindow, toCents } from "@/lib/format";
import { OrderStatusBadge } from "@/components/ops/order-status-badge";
import { PageSkeleton } from "@/components/ops/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CancelOrderButton } from "./cancel-order-button";

export const metadata: Metadata = { title: "Order" };

type Params = Promise<{ id: string }>;

export default function OrderDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

async function OrderDetail({ params }: { params: Params }) {
  const { db } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const order = await getOrder(db, id);
  if (!order) notFound();

  const cancellable = order.status === "confirmed" || order.status === "planned";
  const money = (value: string) => formatMoney(toCents(value));

  return (
    <>
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" className="-ml-2 self-start">
          <Link href="/admin/orders">
            <ArrowLeftIcon data-icon="inline-start" />
            Orders
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">Order {order.code}</h1>
            <OrderStatusBadge status={order.status} />
            {order.source === "import" && <Badge variant="outline">Imported (Dec 2025)</Badge>}
            {order.is_zero_value && <Badge variant="outline">$0 order</Badge>}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={`/track/${order.tracking_token}`} target="_blank" rel="noopener noreferrer">
                Customer tracking page
                <ExternalLinkIcon data-icon="inline-end" />
              </a>
            </Button>
            {cancellable && <CancelOrderButton orderId={order.id} code={order.code} />}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Placed {formatDateOf(order.created_at)}, {formatTime(order.created_at)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="font-medium">
              {formatServiceDate(order.slot.service_date)}, {formatWindow(order.slot.window_start, order.slot.window_end)}
            </p>
            <p>{order.address_line1}</p>
            {order.address_line2 && <p>{order.address_line2}</p>}
            <p>Singapore {order.postal_code}</p>
            {order.lat === null && (
              <p className="pt-2 text-warning">No map location for this postal code — check the address before dispatch.</p>
            )}
            <Button asChild variant="link" className="h-auto self-start p-0">
              <Link href={`/admin/orders?date=${order.slot.service_date}`}>Other orders that day</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="font-medium">{order.customer_name}</p>
            <a href={`tel:${order.phone.replace(/\s/g, "")}`} className="underline-offset-4 hover:underline">
              {order.phone}
            </a>
            <a href={`mailto:${order.email}`} className="break-all underline-offset-4 hover:underline">
              {order.email}
            </a>
            {order.notes && (
              <>
                <Separator className="my-2" />
                <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Customer notes</p>
                <p className="whitespace-pre-line">{order.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <dl className="flex flex-col gap-1.5 [&>div]:flex [&>div]:justify-between [&_dd]:tabular-nums">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>{toCents(order.delivery_fee) === 0 ? "Free" : money(order.delivery_fee)}</dd>
              </div>
              <div>
                <dt>GST</dt>
                <dd>{money(order.gst)}</dd>
              </div>
              <div className="border-t pt-1.5 font-bold">
                <dt>Total</dt>
                <dd>{money(order.total)}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground">
              {order.payment_status.replace("_", " ")}
              {order.payment_method && ` · ${order.payment_method}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Item</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="pr-4 text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id} className="h-11">
                  <TableCell className="pl-4">{item.name_snapshot}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.unit_price)}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{money(item.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
