import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getBookableSlots } from "@/lib/slots";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <div className="mx-auto flex max-w-[72rem] flex-col gap-8">
        <h1 className="font-display text-5xl uppercase">Checkout</h1>
        <Suspense fallback={<CheckoutSkeleton />}>
          <CheckoutWithSlots />
        </Suspense>
      </div>
    </div>
  );
}

async function CheckoutWithSlots() {
  await connection(); // slot capacity is live data: render per request
  const { slots, nowMs } = await getBookableSlots();
  return <CheckoutForm slots={slots} nowMs={nowMs} />;
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_1fr]" aria-busy="true" aria-label="Loading checkout">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
