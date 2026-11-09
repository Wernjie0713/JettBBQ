import { cn } from "@/lib/utils";

/** "34 / 40" with a bar; colour is backed by the numbers (docs/DESIGN.md §1.6). */
export function CapacityBar({
  used,
  capacity,
  label = "Ribs booked",
  className,
}: {
  used: number;
  capacity: number;
  label?: string;
  className?: string;
}) {
  const percent = capacity > 0 ? Math.min(100, Math.round((used * 100) / capacity)) : used > 0 ? 100 : 0;
  return (
    <div className={cn("flex min-w-32 items-center gap-3", className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={used}
      >
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 100 ? "bg-destructive" : percent >= 80 ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-16 text-right text-sm tabular-nums">
        {used} / {capacity}
      </span>
    </div>
  );
}
