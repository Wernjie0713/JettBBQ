"use client";

// Driver page (docs/DESIGN.md §8): phone-first, large text and 56px buttons, one stop at a time.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, NavigationIcon, PhoneIcon, XIcon } from "lucide-react";
import { formatDateOf, formatTime, formatWindow } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/shop/auto-refresh";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { markStop, startRun, type DriverActionResult } from "./actions";

type StopStatus = "pending" | "delivered" | "failed";

type DriverStop = {
  id: string;
  sequence: number;
  status: StopStatus;
  eta: string | null;
  delivered_at: string | null;
  failure_reason: string | null;
  code: string;
  customer_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  driver_note: string | null;
};

export type DriverRunData = {
  run_number: number;
  color: string;
  status: "planned" | "assigned" | "in_progress" | "completed";
  driver_name: string | null;
  planned_departure: string | null;
  total_km: string | null;
  window_start: string;
  window_end: string;
  stops: DriverStop[];
};

const FAILURE_REASONS = ["No one home", "Wrong or unclear address", "Customer refused", "Couldn't get access"];
const BIG = "h-14 w-full text-base font-bold";

const hasPoint = (stop: DriverStop) => stop.lat !== null && stop.lng !== null;
const addressText = (stop: DriverStop) => `${stop.address_line1}, Singapore ${stop.postal_code}`;

function googleMapsUrl(stop: DriverStop): string {
  const destination = hasPoint(stop) ? `${stop.lat},${stop.lng}` : addressText(stop);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function wazeUrl(stop: DriverStop): string {
  return hasPoint(stop)
    ? `https://waze.com/ul?ll=${encodeURIComponent(`${stop.lat},${stop.lng}`)}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(addressText(stop))}&navigate=yes`;
}

const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function DriverRun({ token, run }: { token: string; run: DriverRunData }) {
  const [pending, startTransition] = useTransition();
  const current = run.stops.find((s) => s.status === "pending") ?? null;
  const done = run.stops.filter((s) => s.status !== "pending").length;
  const started = run.status === "in_progress" || run.status === "completed";
  const color = /^#[0-9A-Fa-f]{6}$/.test(run.color) ? run.color : "#7F7F7F";

  const act = (action: () => Promise<DriverActionResult>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.message);
      else if (success) toast.success(success);
    });

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh active={run.status !== "completed"} intervalMs={60_000} />

      <header className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {run.run_number}
        </span>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-xl font-bold">Jett Barbecue · Run {run.run_number}</h1>
          <p className="text-muted-foreground">
            {formatDateOf(run.window_start)}, {formatWindow(run.window_start, run.window_end)}
          </p>
        </div>
      </header>

      <p className="text-lg font-semibold tabular-nums" aria-live="polite">
        {current ? `Stop ${current.sequence} of ${run.stops.length}` : `All ${run.stops.length} stops done`}
        <span className="ml-2 font-normal text-muted-foreground">({done} done)</span>
      </p>

      {!started && run.stops.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
          <p>
            {run.planned_departure ? (
              <>
                Leave the kitchen by <strong>{formatTime(run.planned_departure)}</strong>
                {run.total_km && <> · about {Math.round(Number(run.total_km))} km</>}.
              </>
            ) : (
              "Pick up the orders at the kitchen."
            )}{" "}
            Customers see &ldquo;Out for delivery&rdquo; once you start.
          </p>
          <Button className={BIG} disabled={pending} onClick={() => act(() => startRun(token), "Run started. Drive safe!")}>
            {pending && <Spinner data-icon="inline-start" />}
            Start run
          </Button>
        </div>
      )}

      {current ? (
        <StopCard key={current.id} stop={current} token={token} pending={pending} act={act} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-success/10 p-6 text-center">
          <CheckIcon className="size-8 text-success" aria-hidden />
          <p className="text-lg font-bold">Run complete</p>
          <p className="text-muted-foreground">Thanks{run.driver_name ? `, ${run.driver_name}` : ""}! You can close this page.</p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium tracking-[0.08em] text-muted-foreground uppercase">All stops</h2>
        <ol className="flex flex-col divide-y rounded-lg border">
          {run.stops.map((stop) => (
            <li key={stop.id} className={cn("flex flex-col gap-1 px-3 py-3", stop.id === current?.id && "bg-muted/50")}>
              <div className="flex items-center gap-3">
                <span className="w-6 text-right font-bold tabular-nums">{stop.sequence}</span>
                <span className="min-w-0 flex-1 truncate">{stop.address_line1}</span>
                {stop.status === "delivered" && <Badge variant="success">Delivered</Badge>}
                {stop.status === "failed" && <Badge variant="destructive">Not delivered</Badge>}
                {stop.status === "pending" && stop.eta && (
                  <span className="text-sm text-muted-foreground tabular-nums">{formatTime(stop.eta)}</span>
                )}
              </div>
              {stop.status === "failed" && (
                <div className="flex items-center gap-3 pl-9">
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">{stop.failure_reason}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      act(() => markStop({ token, stopId: stop.id, status: "delivered" }), `Stop ${stop.sequence} delivered`)
                    }
                  >
                    Delivered after all
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function StopCard({
  stop,
  token,
  pending,
  act,
}: {
  stop: DriverStop;
  token: string;
  pending: boolean;
  act: (action: () => Promise<DriverActionResult>, success?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const note = [stop.driver_note, stop.notes].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col gap-4 rounded-lg border-2 border-foreground p-4" aria-label={`Current stop ${stop.sequence}`}>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {stop.code}
          {stop.eta && <> · ETA {formatTime(stop.eta)}</>}
        </p>
        <p className="text-xl leading-snug font-bold">{stop.address_line1}</p>
        {stop.address_line2 && <p className="text-lg">{stop.address_line2}</p>}
        <p className="text-lg">Singapore {stop.postal_code}</p>
        <p className="mt-1 text-lg">{stop.customer_name}</p>
        {note && <p className="mt-1 rounded-md bg-muted p-2">{note}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild className={BIG}>
          <a href={googleMapsUrl(stop)} target="_blank" rel="noopener noreferrer">
            <NavigationIcon data-icon="inline-start" />
            Navigate
          </a>
        </Button>
        <Button asChild variant="outline" className={BIG}>
          <a href={telUrl(stop.phone)}>
            <PhoneIcon data-icon="inline-start" />
            Call
          </a>
        </Button>
        <Button asChild variant="outline" className={cn(BIG, "col-span-2")}>
          <a href={wazeUrl(stop)} target="_blank" rel="noopener noreferrer">
            <NavigationIcon data-icon="inline-start" />
            Open in Waze
          </a>
        </Button>
      </div>

      <Button
        className={cn(BIG, "bg-success text-white hover:bg-success/90")}
        disabled={pending}
        onClick={() => act(() => markStop({ token, stopId: stop.id, status: "delivered" }), `Stop ${stop.sequence} delivered`)}
      >
        {pending ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
        Delivered
      </Button>

      <AlertDialog onOpenChange={(open) => !open && setReason("")}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className={cn(BIG, "border-destructive text-destructive")} disabled={pending}>
            <XIcon data-icon="inline-start" />
            Can&apos;t deliver
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Why couldn&apos;t you deliver?</AlertDialogTitle>
            <AlertDialogDescription>Jett will contact the customer. Pick a reason or type one.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2">
            {FAILURE_REASONS.map((r) => (
              <Button key={r} type="button" size="sm" variant={reason === r ? "default" : "outline"} onClick={() => setReason(r)}>
                {r}
              </Button>
            ))}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Reason"
            aria-label="Reason"
            className="text-base"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!reason.trim() || pending}
              onClick={() =>
                act(
                  () => markStop({ token, stopId: stop.id, status: "failed", reason: reason.trim() }),
                  `Stop ${stop.sequence} marked not delivered`,
                )
              }
            >
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
