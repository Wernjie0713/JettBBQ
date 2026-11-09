"use client";

import Image from "next/image";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { MenuItem } from "@/lib/menu";
import { formatMoney, formatSeason } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "./cart";
import { QuantityStepper } from "./quantity-stepper";

export function MenuItemCard({ item, priority = false }: { item: MenuItem; priority?: boolean }) {
  const { qtyOf, add, setQty, setSheetOpen } = useCart();
  const qty = qtyOf(item.id);

  const onAdd = () => {
    add(item.id);
    toast.success(`${item.name} added`, {
      action: { label: "View cart", onClick: () => setSheetOpen(true) },
    });
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-sm border border-border bg-card">
      <div className="relative aspect-[4/3] bg-sand">
        {item.imagePath && (
          <Image
            src={item.imagePath}
            alt={item.name}
            fill
            sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
            loading={priority ? "eager" : "lazy"}
            className="object-cover"
          />
        )}
        {item.availableFrom && item.availableTo && (
          <Badge variant="brand" className="absolute top-3 left-3 h-6 px-2.5">
            Christmas · {formatSeason(item.availableFrom, item.availableTo)}
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-lg leading-7 font-bold">{item.name}</h3>
        {item.description && <p className="line-clamp-2 text-muted-foreground">{item.description}</p>}
        {item.serves && <p className="text-sm font-medium">{item.serves}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <p className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums">{formatMoney(item.priceCents)}</span>
            <span className="text-sm text-muted-foreground">before GST</span>
          </p>
          {qty === 0 ? (
            <Button className="h-11 px-5 font-bold" onClick={onAdd}>
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          ) : (
            <QuantityStepper value={qty} onChange={(next) => setQty(item.id, next)} itemName={item.name} />
          )}
        </div>
      </div>
    </article>
  );
}
