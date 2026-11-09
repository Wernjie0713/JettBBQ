import { TruckIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";

export function FreeDeliveryProgress({
  subtotalCents,
  thresholdCents,
}: {
  subtotalCents: number;
  thresholdCents: number;
}) {
  const remaining = Math.max(0, thresholdCents - subtotalCents);
  const percent = thresholdCents > 0 ? Math.min(100, Math.floor((subtotalCents * 100) / thresholdCents)) : 100;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm">
        <TruckIcon className="size-4 shrink-0" aria-hidden />
        {remaining > 0 ? (
          <span>
            Add <strong className="tabular-nums">{formatMoney(remaining)}</strong> more for free delivery
          </span>
        ) : (
          <span className="font-bold">You&apos;ve unlocked free delivery</span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progress to free delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden bg-sand"
      >
        <div
          className="h-full bg-ember motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
