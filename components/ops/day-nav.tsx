import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { addDaysToDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Busiest day in the Dec 2025 data (5pm slot: 97 orders) — the demo replay. */
export const PEAK_DEMO_DATE = "2025-12-24";

/** Previous / date picker / next day controls for a page keyed by ?date=, plus Today and peak-day shortcuts. */
export function DayNav({
  basePath,
  date,
  today,
  peakLabel,
}: {
  basePath: string;
  date: string;
  today?: string; // shows a "Today" shortcut when set and not already on it
  peakLabel: string;
}) {
  return (
    <>
      <Button asChild variant="outline" size="icon" aria-label="Previous day">
        <Link href={`${basePath}?date=${addDaysToDate(date, -1)}`}>
          <ChevronLeftIcon />
        </Link>
      </Button>
      {/* Keyed by date: the input is uncontrolled, so without a remount it keeps showing the old date after the arrows navigate. */}
      <form key={date} action={basePath} className="flex items-center gap-2">
        <Input type="date" name="date" defaultValue={date} aria-label="Date" className="h-8 w-40" />
        <Button type="submit" variant="outline">
          Go
        </Button>
      </form>
      <Button asChild variant="outline" size="icon" aria-label="Next day">
        <Link href={`${basePath}?date=${addDaysToDate(date, 1)}`}>
          <ChevronRightIcon />
        </Link>
      </Button>
      {today && date !== today && (
        <Button asChild variant="ghost">
          <Link href={basePath}>Today</Link>
        </Button>
      )}
      {date !== PEAK_DEMO_DATE && (
        <Button asChild variant="secondary">
          <Link href={`${basePath}?date=${PEAK_DEMO_DATE}`}>{peakLabel}</Link>
        </Button>
      )}
    </>
  );
}
