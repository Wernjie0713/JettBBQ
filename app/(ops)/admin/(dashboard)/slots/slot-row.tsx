"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AdminSlot } from "@/lib/admin-data";
import { formatWindow } from "@/lib/format";
import { CapacityBar } from "@/components/ops/capacity-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { updateSlot } from "./actions";

export function SlotRow({ slot, past }: { slot: AdminSlot; past: boolean }) {
  const [capacity, setCapacity] = useState(String(slot.rib_capacity));
  const [pending, startTransition] = useTransition();
  const label = formatWindow(slot.window_start, slot.window_end);
  const capacityValue = Number(capacity);
  const capacityChanged = capacity !== String(slot.rib_capacity);
  const capacityValid =
    capacity.trim() !== "" && // Number("") is 0
    Number.isInteger(capacityValue) &&
    capacityValue >= slot.ribs_booked &&
    capacityValue <= 10_000;

  const save = (patch: { isOpen?: boolean; ribCapacity?: number }, success: string) =>
    startTransition(async () => {
      const result = await updateSlot({ id: slot.id, ...patch });
      if (result.ok) toast.success(success);
      else toast.error(result.message);
    });

  return (
    <TableRow className="h-11">
      <TableCell className="pl-4 font-medium tabular-nums">{label}</TableCell>
      <TableCell>
        <CapacityBar used={slot.ribs_booked} capacity={slot.rib_capacity} />
      </TableCell>
      <TableCell>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (capacityValid) save({ ribCapacity: capacityValue }, `Capacity for ${label} set to ${capacityValue} ribs`);
          }}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={slot.ribs_booked}
            max={10_000}
            step={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            aria-label={`Rib capacity for ${label}`}
            aria-invalid={capacityChanged && !capacityValid}
            disabled={past || pending}
            className="h-8 w-20 tabular-nums"
          />
          {capacityChanged && (
            <Button type="submit" size="sm" disabled={!capacityValid || pending}>
              Save
            </Button>
          )}
        </form>
      </TableCell>
      <TableCell className="pr-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={slot.is_open}
            disabled={past || pending}
            onCheckedChange={(checked) =>
              save({ isOpen: checked }, `${label} ${checked ? "opened" : "closed"} for new orders`)
            }
            aria-label={`Taking orders for ${label}`}
          />
          {slot.is_open ? "Taking orders" : "Closed"}
        </label>
      </TableCell>
    </TableRow>
  );
}
