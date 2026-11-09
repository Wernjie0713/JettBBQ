"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MAX_QTY_PER_ITEM as MAX_QTY } from "@/lib/order-limits";

export function QuantityStepper({
  value,
  onChange,
  itemName,
  className,
}: {
  value: number;
  onChange: (qty: number) => void;
  itemName: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={`Quantity of ${itemName}`}
      className={cn("inline-flex items-center rounded-sm border border-border bg-card", className)}
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-11 rounded-none"
        onClick={() => onChange(value - 1)}
        aria-label={value === 1 ? `Remove ${itemName}` : `One fewer ${itemName}`}
      >
        <MinusIcon />
      </Button>
      <span className="min-w-8 text-center font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 rounded-none"
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QTY}
        aria-label={`One more ${itemName}`}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
