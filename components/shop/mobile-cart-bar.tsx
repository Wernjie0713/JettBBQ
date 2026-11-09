"use client";

import { ShoppingBagIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useCart } from "./cart";

/** Sticky bottom bar on small screens once the cart has something in it. */
export function MobileCartBar() {
  const { count, subtotalCents, setSheetOpen } = useCart();
  if (count === 0) return null;

  return (
    <div className="sticky bottom-0 z-30 border-t bg-background p-3 lg:hidden">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-sm bg-primary px-5 font-bold text-primary-foreground"
      >
        <span className="flex items-center gap-2">
          <ShoppingBagIcon className="size-5" aria-hidden />
          {count} {count === 1 ? "item" : "items"} · <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
        </span>
        <span>View cart</span>
      </button>
    </div>
  );
}
