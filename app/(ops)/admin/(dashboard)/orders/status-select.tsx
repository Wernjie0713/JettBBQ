"use client";

import { useState } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/admin-data";
import { orderStatusLabel } from "@/components/ops/order-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Status filter for the GET form. The label is explicit: Radix can't show it before the menu first mounts. */
export function StatusSelect({ defaultValue }: { defaultValue?: OrderStatus }) {
  const [value, setValue] = useState<string>(defaultValue ?? "all");
  return (
    <Select name="status" value={value} onValueChange={setValue}>
      <SelectTrigger className="w-44" aria-label="Status">
        <SelectValue>{value === "all" ? "All statuses" : orderStatusLabel(value as OrderStatus)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {ORDER_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {orderStatusLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
