"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowRightLeftIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { lateStopIds, type DispatchOrder, type DispatchRun, type RunStatus } from "@/lib/dispatch";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CapacityBar } from "@/components/ops/capacity-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { saveDriver } from "./actions";

const RUN_STATUS: Record<RunStatus, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  planned: { label: "Needs driver", variant: "secondary" },
  assigned: { label: "Driver assigned", variant: "info" },
  in_progress: { label: "On the road", variant: "ember" },
  completed: { label: "Completed", variant: "success" },
};

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function RunSwatch({ color, number, className }: { color: string; number: number; className?: string }) {
  return (
    <span
      className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {number}
    </span>
  );
}

/** "Move to…" menu for one order: any other run, or a new run. */
export function MoveMenu({
  runs,
  currentRunId,
  disabled,
  onMove,
  label,
}: {
  runs: Pick<DispatchRun, "id" | "run_number" | "color">[];
  currentRunId: string | null;
  disabled: boolean;
  onMove: (target: string) => void;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={label}>
          <ArrowRightLeftIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {runs
          .filter((r) => r.id !== currentRunId)
          .map((r) => (
            <DropdownMenuItem key={r.id} onSelect={() => onMove(r.id)}>
              <RunSwatch color={r.color} number={r.run_number} className="size-5" />
              Run {r.run_number}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onMove("new")}>New run</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RunCard({
  run,
  runs,
  orderById,
  capacity,
  windowEnd,
  deadlines,
  selected,
  locked,
  busy,
  onSelect,
  onMove,
}: {
  run: DispatchRun;
  runs: DispatchRun[];
  orderById: Map<string, DispatchOrder>;
  capacity: number;
  windowEnd: string;
  deadlines: { orderId: string; by: number }[];
  selected: boolean;
  locked: boolean;
  busy: boolean;
  onSelect: () => void;
  onMove: (orderId: string, target: string) => void;
}) {
  const [saving, startSaving] = useTransition();
  const status = RUN_STATUS[run.status];
  const load = run.stops.reduce((n, s) => n + (orderById.get(s.order_id)?.load ?? 0), 0);
  const lateIds = lateStopIds([run], windowEnd, deadlines);
  const lastEta = run.stops.at(-1)?.eta;
  const done = run.stops.filter((s) => s.status !== "pending").length;

  const onSaveDriver = (form: FormData) =>
    startSaving(async () => {
      const result = await saveDriver({
        runId: run.id,
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        plate: String(form.get("plate") ?? ""),
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/run/${run.driver_token}`);
      toast.success(`Driver link for Run ${run.run_number} copied`);
    } catch (error) {
      console.error("Copy driver link failed", error);
      toast.error("Couldn't copy. Use Open link and copy it from the address bar.");
    }
  };

  return (
    <Card className={cn("gap-3 py-3", selected && "ring-2 ring-ring")}>
      <CardContent className="flex flex-col gap-3 px-3">
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={selected}
          className="flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RunSwatch color={run.color} number={run.run_number} />
          <span className="font-semibold">Run {run.run_number}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {run.status === "planned" || run.status === "assigned"
              ? `${run.stops.length} stops`
              : `${done}/${run.stops.length} done`}
          </span>
          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", selected && "rotate-180")} />
        </button>

        <CapacityBar used={round1(load)} capacity={capacity} label="Car load" className="min-w-0" />

        <p className="text-sm text-muted-foreground tabular-nums">
          {run.total_km !== null && `${round1(run.total_km)} km · `}
          {run.planned_departure && `leaves ${formatTime(run.planned_departure)}`}
          {lastEta && ` → last stop ${formatTime(lastEta)}`}
          {lateIds.size > 0 && (
            <Badge variant="destructive" className="ml-2">
              {lateIds.size} late
            </Badge>
          )}
        </p>

        {selected && (
          <ol className="flex flex-col divide-y rounded-md border">
            {run.stops.map((stop) => {
              const order = orderById.get(stop.order_id);
              const isLate = lateIds.has(stop.id);
              return (
                <li key={stop.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{stop.sequence}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {order?.code ?? "Order"} · {order?.postal_code}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{order?.customer_name}</span>
                  </span>
                  {stop.status === "delivered" && <Badge variant="success">Delivered</Badge>}
                  {stop.status === "failed" && <Badge variant="destructive">Failed</Badge>}
                  {stop.eta && stop.status === "pending" && (
                    <span className={cn("text-xs tabular-nums", isLate ? "font-semibold text-destructive" : "text-muted-foreground")}>
                      {formatTime(stop.eta)}
                    </span>
                  )}
                  <MoveMenu
                    runs={runs}
                    currentRunId={run.id}
                    disabled={locked || busy}
                    onMove={(target) => onMove(stop.order_id, target)}
                    label={`Move ${order?.code ?? "order"} to another run`}
                  />
                </li>
              );
            })}
          </ol>
        )}

        <form action={onSaveDriver} className="grid grid-cols-2 gap-2" key={`${run.driver_name}|${run.driver_phone}|${run.vehicle_plate}`}>
          <Input name="name" defaultValue={run.driver_name ?? ""} placeholder="Grab driver name" aria-label="Driver name" className="col-span-2 h-8" maxLength={120} />
          <Input name="phone" defaultValue={run.driver_phone ?? ""} placeholder="Phone" aria-label="Driver phone" inputMode="tel" className="h-8" maxLength={32} />
          <Input name="plate" defaultValue={run.vehicle_plate ?? ""} placeholder="Plate" aria-label="Vehicle plate" className="h-8 uppercase" maxLength={16} />
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="outline" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              Save driver
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={copyLink}>
              <CopyIcon data-icon="inline-start" />
              Copy driver link
            </Button>
            <Button asChild size="icon-sm" variant="ghost" aria-label={`Open driver page for Run ${run.run_number}`}>
              <a href={`/run/${run.driver_token}`} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon />
              </a>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
