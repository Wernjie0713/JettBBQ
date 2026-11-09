"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { formatServiceDateRange } from "@/lib/format";
import { addDaysToDate, dateToKey, keyToDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Button showing the current range; opens a two-month calendar and navigates once both ends are picked. */
export function RangePicker({ from, to, maxDays }: { from: string; to: string; maxDays: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();

  // While only the start is picked, grey out days that would make the range too long.
  const pendingStart = range?.from && !range.to ? dateToKey(range.from) : null;
  const tooFar = pendingStart
    ? [
        { before: keyToDate(addDaysToDate(pendingStart, -(maxDays - 1))) },
        { after: keyToDate(addDaysToDate(pendingStart, maxDays - 1)) },
      ]
    : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRange({ from: keyToDate(from), to: keyToDate(to) });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="tabular-nums" aria-label="Date range">
          <CalendarIcon data-icon="inline-start" />
          {formatServiceDateRange(from, to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="range"
          resetOnSelect
          numberOfMonths={2}
          defaultMonth={keyToDate(from)}
          selected={range}
          disabled={tooFar}
          onSelect={(next) => {
            setRange(next);
            if (next?.from && next.to) {
              setOpen(false);
              router.push(`/admin/slots?from=${dateToKey(next.from)}&to=${dateToKey(next.to)}`);
            }
          }}
          className="p-3"
        />
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {pendingStart ? "Now pick the end date." : "Pick a start date, then an end date."} Up to {maxDays} days.
        </p>
      </PopoverContent>
    </Popover>
  );
}
