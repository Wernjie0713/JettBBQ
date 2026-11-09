import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, ChefHatIcon, CircleAlertIcon, MapIcon, TruckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateOf, formatMoney, formatTime, formatWindow, toCents } from "@/lib/format";
import { SITE } from "@/lib/site";
import { publicClient } from "@/lib/supabase/clients";
import { AutoRefresh } from "@/components/shop/auto-refresh";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

type OrderStatus = "confirmed" | "planned" | "out_for_delivery" | "delivered" | "failed" | "cancelled";

type TrackedOrder = {
  code: string;
  status: OrderStatus;
  customer_name: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  subtotal: string;
  delivery_fee: string;
  gst: string;
  total: string;
  window_start: string;
  window_end: string;
  eta: string | null;
  delivered_at: string | null;
  items: { name: string; qty: number; line_total: string }[];
};

const TIMELINE = [
  { status: "confirmed", label: "Order confirmed", icon: CheckIcon },
  { status: "planned", label: "Route planned", icon: MapIcon },
  { status: "out_for_delivery", label: "Out for delivery", icon: TruckIcon },
  { status: "delivered", label: "Delivered", icon: ChefHatIcon },
] as const;

const ETA_HALF_WINDOW_MS = 10 * 60 * 1000; // show a 20-minute window around the planned ETA

export default function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <div className="mx-auto max-w-[56.25rem]">
        <Suspense fallback={<TrackSkeleton />}>
          <TrackedOrderView params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function TrackedOrderView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();

  const { data, error } = await publicClient().rpc("get_order_by_token", { p_token: token });
  if (error) throw new Error(`get_order_by_token failed: ${error.message}`);
  if (!data) notFound();
  const order = data as TrackedOrder;

  const finished = ["delivered", "failed", "cancelled"].includes(order.status);
  const currentIndex = TIMELINE.findIndex((s) => s.status === order.status);
  const firstName = order.customer_name.split(/\s+/)[0];

  let arrivalLabel = "Delivery window";
  let arrival = formatWindow(order.window_start, order.window_end);
  if (order.status === "delivered" && order.delivered_at) {
    arrivalLabel = "Delivered at";
    arrival = formatTime(order.delivered_at);
  } else if (order.eta && !finished) {
    const eta = Date.parse(order.eta);
    arrivalLabel = "Estimated arrival";
    arrival = formatWindow(new Date(eta - ETA_HALF_WINDOW_MS), new Date(eta + ETA_HALF_WINDOW_MS));
  }

  return (
    <div className="flex flex-col gap-10">
      <AutoRefresh active={!finished} />

      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground uppercase">Order {order.code}</p>
        <h1 className="font-display text-5xl uppercase md:text-6xl">
          {order.status === "cancelled" ? "Order cancelled" : `Thanks, ${firstName}!`}
        </h1>
        <p className="text-lg font-light">
          {order.status === "cancelled"
            ? "This order was cancelled. WhatsApp us if that's unexpected."
            : "Your ribs are booked. This page updates as your order moves along — bookmark it."}
        </p>
      </header>

      {order.status !== "cancelled" && (
        <section className="grid gap-8 rounded-sm bg-char p-6 text-bone md:grid-cols-[1fr_1fr] md:p-8">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-[0.3em] text-bone/70 uppercase">{arrivalLabel}</p>
            <p className="font-display text-5xl leading-none uppercase tabular-nums md:text-6xl">{arrival}</p>
            <p className="text-lg">{formatDateOf(order.window_start)}</p>
          </div>

          {order.status === "failed" ? (
            <p className="flex items-start gap-3 self-center text-lg">
              <CircleAlertIcon className="mt-1 size-5 shrink-0" aria-hidden />
              We couldn&apos;t complete this delivery. We&apos;ll contact you to arrange it.
            </p>
          ) : (
            <ol className="flex flex-col gap-4" aria-label="Order progress">
              {TIMELINE.map((step, index) => {
                const done = index < currentIndex || order.status === "delivered";
                const current = index === currentIndex && order.status !== "delivered";
                const Icon = step.icon;
                return (
                  <li key={step.status} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border",
                        done && "border-success bg-success text-white",
                        current && "border-ember bg-ember text-char",
                        !done && !current && "border-bone/30 text-bone/50",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className={cn(current ? "font-bold" : done ? "text-bone" : "text-bone/60")}>
                      {step.label}
                      <span className="sr-only">{done ? " (done)" : current ? " (current)" : " (upcoming)"}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      <section className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-sm border bg-card p-6">
          <h2 className="font-display text-2xl uppercase">Your order</h2>
          <ul className="flex flex-col gap-3">
            {order.items.map((item, index) => (
              <li key={`${index}-${item.name}`} className="flex justify-between gap-4">
                <span>
                  <span className="font-bold tabular-nums">{item.qty} ×</span> {item.name}
                </span>
                <span className="tabular-nums">{formatMoney(toCents(item.line_total))}</span>
              </li>
            ))}
          </ul>
          <Separator />
          <dl className="flex flex-col gap-2 text-sm [&_dd]:tabular-nums [&>div]:flex [&>div]:justify-between">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(toCents(order.subtotal))}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{toCents(order.delivery_fee) === 0 ? "Free" : formatMoney(toCents(order.delivery_fee))}</dd>
            </div>
            <div>
              <dt>GST</dt>
              <dd>{formatMoney(toCents(order.gst))}</dd>
            </div>
          </dl>
          <Separator />
          <div className="flex items-baseline justify-between">
            <span className="font-bold">Total paid</span>
            <span className="text-xl font-bold tabular-nums">{formatMoney(toCents(order.total))}</span>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Delivering to</p>
            <p>{order.address_line1}</p>
            {order.address_line2 && <p>{order.address_line2}</p>}
            <p>Singapore {order.postal_code}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Need help?</p>
            <p>
              WhatsApp us at{" "}
              <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-brand underline underline-offset-4">
                {SITE.whatsappDisplay}
              </a>{" "}
              with your order number <strong>{order.code}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Reheating tips:{" "}
              <a href={SITE.reheatGuideUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                our reheat guide
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function TrackSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading your order">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-14 w-2/3" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
