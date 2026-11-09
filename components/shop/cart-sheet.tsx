"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCart } from "./cart";
import { FreeDeliveryProgress } from "./free-delivery-progress";
import { QuantityStepper } from "./quantity-stepper";

export function CartSheet() {
  const { lines, count, subtotalCents, settings, setQty, sheetOpen, setSheetOpen } = useCart();
  const close = () => setSheetOpen(false);

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-[420px]">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="font-display text-3xl font-normal uppercase">Your cart</SheetTitle>
          <SheetDescription>
            {count === 0 ? "Nothing here yet." : `${count} ${count === 1 ? "item" : "items"} · prices before GST`}
          </SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <ShoppingBagIcon className="size-10 text-muted-foreground" aria-hidden />
            <p className="text-base text-muted-foreground">Your cart is empty. The ribs are waiting.</p>
            <Button asChild size="cta">
              <Link href="/order" onClick={close}>
                Browse the menu
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="flex flex-1 flex-col divide-y overflow-y-auto px-6">
              {lines.map(({ item, qty, lineCents }) => (
                <li key={item.id} className="flex gap-4 py-4">
                  <div className="relative size-18 shrink-0 overflow-hidden rounded-sm bg-sand">
                    {item.imagePath && (
                      <Image src={item.imagePath} alt="" fill sizes="72px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold leading-snug">{item.name}</p>
                      <p className="font-bold tabular-nums">{formatMoney(lineCents)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <QuantityStepper
                        value={qty}
                        onChange={(next) => setQty(item.id, next)}
                        itemName={item.name}
                      />
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatMoney(item.priceCents)} each
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <SheetFooter className="gap-4 border-t px-6 py-5">
              <FreeDeliveryProgress
                subtotalCents={subtotalCents}
                thresholdCents={settings.freeDeliveryThresholdCents}
              />
              <div className="flex items-baseline justify-between">
                <span className="text-base">Subtotal</span>
                <span className="text-xl font-bold tabular-nums">{formatMoney(subtotalCents)}</span>
              </div>
              <Button asChild size="cta" className="w-full">
                <Link href="/checkout" onClick={close}>
                  Checkout
                </Link>
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Delivery fee and {settings.gstBasisPoints / 100}% GST are added at checkout.
              </p>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
