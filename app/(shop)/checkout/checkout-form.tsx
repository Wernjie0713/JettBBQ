"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { CircleAlertIcon, InfoIcon, MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatServiceDate, formatWindow, gstCents } from "@/lib/format";
import { SITE } from "@/lib/site";
import type { Slot } from "@/lib/slots";
import { dateToKey, keyToDate } from "@/lib/time";
import { useCart, type CartLine } from "@/components/shop/cart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { lookupAddress, placeOrder, type AddressResult } from "./actions";

const DAY_MS = 24 * 60 * 60 * 1000;
const STEPS = ["Delivery", "Details", "Review & pay"] as const;
const ALMOST_FULL_RIBS = 10;
const inputClass = "h-11 bg-card text-base";

type Address = Extract<AddressResult, { ok: true }>;
type Step = 1 | 2 | 3;

export function CheckoutForm({ slots, nowMs }: { slots: Slot[]; nowMs: number }) {
  const router = useRouter();
  const { lines, subtotalCents, settings, clear } = useCart();

  const [step, setStep] = useState<Step>(1);
  const [postalInput, setPostalInput] = useState("");
  const [address, setAddress] = useState<Address | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [lookingUp, startLookup] = useTransition();
  const [addressLine2, setAddressLine2] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [slotId, setSlotId] = useState("");
  const [details, setDetails] = useState({ customerName: "", email: "", phone: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  const [placed, setPlaced] = useState(false);
  // One key per checkout: retries of the same order can never create a duplicate.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Each step starts at the top, next to the progress bar.
  const goToStep = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  // What the cart requires of a slot: rib capacity, lead time and seasonal date range.
  const needs = useMemo(() => {
    let ribs = 0;
    let christmas = false;
    let from: string | null = null;
    let to: string | null = null;
    for (const { item, qty } of lines) {
      ribs += item.ribUnits * qty;
      if (item.category === "christmas") christmas = true;
      if (item.availableFrom && (!from || item.availableFrom > from)) from = item.availableFrom;
      if (item.availableTo && (!to || item.availableTo < to)) to = item.availableTo;
    }
    return { ribs, earliestStartMs: nowMs + (christmas ? 3 : 1) * DAY_MS, from, to, christmas };
  }, [lines, nowMs]);

  const { slotsByDate, openDates, fullDates } = useMemo(() => {
    const slotsByDate = new Map<string, { slot: Slot; full: boolean }[]>();
    for (const slot of slots) {
      if (Date.parse(slot.windowStart) < needs.earliestStartMs) continue;
      if (needs.from && slot.serviceDate < needs.from) continue;
      if (needs.to && slot.serviceDate > needs.to) continue;
      const full = needs.ribs > 0 && slot.ribsRemaining < needs.ribs;
      const list = slotsByDate.get(slot.serviceDate) ?? [];
      list.push({ slot, full });
      slotsByDate.set(slot.serviceDate, list);
    }
    const openDates = new Set<string>();
    const fullDates = new Set<string>();
    for (const [day, list] of slotsByDate) (list.some((s) => !s.full) ? openDates : fullDates).add(day);
    return { slotsByDate, openDates, fullDates };
  }, [slots, needs]);

  const daySlots = date ? (slotsByDate.get(date) ?? []) : [];
  const selectedSlot = daySlots.find((s) => s.slot.id === slotId && !s.full)?.slot;
  const allDates = [...slotsByDate.keys()];
  const firstOpenDate = allDates.find((d) => openDates.has(d));

  const feeCents = address
    ? subtotalCents >= settings.freeDeliveryThresholdCents
      ? 0
      : address.deliveryFeeCents
    : null;
  const gst = gstCents(subtotalCents + (feeCents ?? 0), settings.gstBasisPoints);
  const totalCents = subtotalCents + (feeCents ?? 0) + gst;

  if (placed) {
    return (
      <p className="flex items-center gap-3 text-lg">
        <Spinner /> Order placed — opening your tracking page…
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-lg">Your cart is empty.</p>
        <Button asChild size="cta">
          <Link href="/order">Browse the menu</Link>
        </Button>
      </div>
    );
  }

  const onLookup = (event: FormEvent) => {
    event.preventDefault();
    setAddressError(null);
    startLookup(async () => {
      const result = await lookupAddress(postalInput);
      if (result.ok) setAddress(result);
      else {
        setAddress(null);
        setAddressError(result.message);
      }
    });
  };

  const onDetailsSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    goToStep(3);
  };

  const onPay = () => {
    if (!address || !selectedSlot) return goToStep(1);
    setError(null);
    startPlacing(async () => {
      const result = await placeOrder({
        idempotencyKey,
        slotId: selectedSlot.id,
        items: lines.map((l) => ({ id: l.item.id, qty: l.qty })),
        customerName: details.customerName,
        email: details.email,
        phone: details.phone.replace(/\s/g, ""),
        postalCode: address.postalCode,
        addressLine1: address.addressLine1,
        addressLine2,
        notes: details.notes,
      });
      if (result.ok) {
        setPlaced(true);
        clear();
        router.push(`/track/${result.trackingToken}`);
        return;
      }
      setError(result.message);
      if (result.refreshSlots) {
        setSlotId("");
        goToStep(1);
      } else if (result.field && ["customerName", "email", "phone", "notes"].includes(result.field)) {
        goToStep(2);
      }
    });
  };

  const errorAlert = error && (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>We couldn&apos;t place your order</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_1fr] lg:items-start">
      <div className="flex flex-col gap-8">
        <CheckoutProgress step={step} />
        {errorAlert}

        {step === 1 && (
          <div className="flex flex-col gap-8">
            <form onSubmit={onLookup}>
              <FieldSet>
                <FieldLegend className="text-xl font-bold">Where should we deliver?</FieldLegend>
                <FieldGroup>
                  <Field data-invalid={!!addressError}>
                    <FieldLabel htmlFor="postal-code">Postal code</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="postal-code"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={6}
                        placeholder="e.g. 238872"
                        value={postalInput}
                        onChange={(e) => setPostalInput(e.target.value.replace(/\D/g, ""))}
                        aria-invalid={!!addressError}
                        className={inputClass}
                      />
                      <Button type="submit" variant="secondary" className="h-11 px-5 font-bold" disabled={lookingUp}>
                        {lookingUp ? <Spinner data-icon="inline-start" /> : <MapPinIcon data-icon="inline-start" />}
                        Find
                      </Button>
                    </div>
                    {addressError ? (
                      <FieldDescription className="text-destructive">{addressError}</FieldDescription>
                    ) : address ? (
                      <FieldDescription className="text-foreground">
                        <strong>{address.addressLine1}</strong>, Singapore {address.postalCode} ·{" "}
                        {feeCents === 0 ? "Free delivery" : `Delivery ${formatMoney(address.deliveryFeeCents)}`}
                      </FieldDescription>
                    ) : null}
                  </Field>
                  {address && (
                    <Field>
                      <FieldLabel htmlFor="address-line2">Unit number, floor or building (optional)</FieldLabel>
                      <Input
                        id="address-line2"
                        autoComplete="address-line2"
                        placeholder="e.g. #08-12"
                        maxLength={300}
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                  )}
                </FieldGroup>
              </FieldSet>
            </form>

            <FieldSet>
              <FieldLegend className="text-xl font-bold">When?</FieldLegend>
              <FieldDescription>
                {needs.christmas
                  ? "Christmas items need 3 days' notice and are delivered 27 Nov – 3 Jan."
                  : "Order at least 24 hours ahead."}{" "}
                Crossed-out days are fully booked.
              </FieldDescription>
              {allDates.length === 0 ? (
                <Alert>
                  <InfoIcon />
                  <AlertTitle>No delivery slots fit this cart right now</AlertTitle>
                  <AlertDescription>
                    Try removing a seasonal item, or{" "}
                    <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      WhatsApp us
                    </a>{" "}
                    and we&apos;ll sort it out.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col gap-6 md:flex-row md:items-start">
                  <Calendar
                    mode="single"
                    selected={date ? keyToDate(date) : undefined}
                    onSelect={(day) => {
                      setDate(day ? dateToKey(day) : null);
                      setSlotId("");
                    }}
                    disabled={(day) => !openDates.has(dateToKey(day))}
                    modifiers={{ full: (day) => fullDates.has(dateToKey(day)) }}
                    modifiersClassNames={{ full: "[&_button]:line-through" }}
                    defaultMonth={keyToDate(date ?? firstOpenDate ?? allDates[0])}
                    startMonth={keyToDate(allDates[0])}
                    endMonth={keyToDate(allDates[allDates.length - 1])}
                    showOutsideDays={false}
                    className="shrink-0 rounded-sm border bg-card p-3 [--cell-size:--spacing(10)]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    {date ? (
                      <>
                        <p className="font-bold">{formatServiceDate(date)}</p>
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          value={slotId}
                          onValueChange={setSlotId}
                          aria-label="Delivery time"
                          className="grid w-full grid-cols-1 gap-2"
                        >
                          {daySlots.map(({ slot, full }) => (
                            <ToggleGroupItem
                              key={slot.id}
                              value={slot.id}
                              disabled={full}
                              className="h-auto w-full flex-col items-start gap-0.5 rounded-sm px-4 py-3 text-left data-[state=on]:border-2 data-[state=on]:border-ember data-[state=on]:bg-sand"
                            >
                              <span className="text-base font-bold tabular-nums">
                                {formatWindow(slot.windowStart, slot.windowEnd)}
                              </span>
                              <span
                                className={cn(
                                  "text-sm font-normal",
                                  full
                                    ? "text-muted-foreground"
                                    : slot.ribsRemaining <= ALMOST_FULL_RIBS
                                      ? "text-warning"
                                      : "text-success",
                                )}
                              >
                                {full ? "Full" : slot.ribsRemaining <= ALMOST_FULL_RIBS ? "Almost full" : "Available"}
                              </span>
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Pick a date to see delivery times.</p>
                    )}
                  </div>
                </div>
              )}
            </FieldSet>

            <div className="flex flex-col gap-2">
              <Button size="cta" className="w-full sm:w-auto sm:self-start" disabled={!address || !selectedSlot} onClick={() => goToStep(2)}>
                Continue to details
              </Button>
              {(!address || !selectedSlot) && (
                <p className="text-sm text-muted-foreground">
                  {!address ? "Find your address first." : "Pick a delivery date and time."}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={onDetailsSubmit} className="flex flex-col gap-8">
            <FieldSet>
              <FieldLegend className="text-xl font-bold">Your details</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    id="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={details.customerName}
                    onChange={(e) => setDetails({ ...details, customerName: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={details.email}
                    onChange={(e) => setDetails({ ...details, email: e.target.value })}
                    className={inputClass}
                  />
                  <FieldDescription>We&apos;ll send your order confirmation here.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="phone">Mobile number</FieldLabel>
                  <InputGroup className="h-11 bg-card">
                    <InputGroupAddon className="text-base">+65</InputGroupAddon>
                    <InputGroupInput
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      required
                      pattern="[3689][0-9]{3} ?[0-9]{4}"
                      title="An 8-digit Singapore number"
                      maxLength={9}
                      value={details.phone}
                      onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                      className="text-base"
                    />
                  </InputGroup>
                  <FieldDescription>Our driver calls this number if they can&apos;t find you.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="notes">Notes for us (optional)</FieldLabel>
                  <Textarea
                    id="notes"
                    maxLength={1000}
                    rows={3}
                    placeholder="e.g. Leave with the guardhouse. It's a birthday surprise!"
                    value={details.notes}
                    onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                    className="bg-card text-base"
                  />
                </Field>
              </FieldGroup>
            </FieldSet>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="cta">
                Review order
              </Button>
              <Button type="button" variant="ghost" size="cta" onClick={() => goToStep(1)}>
                Back
              </Button>
            </div>
          </form>
        )}

        {step === 3 && address && selectedSlot && (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4" aria-labelledby="review-title">
              <h2 id="review-title" className="text-xl font-bold">
                Review &amp; pay
              </h2>
              <ReviewRow label="Delivery" onEdit={() => goToStep(1)}>
                <p className="font-bold">
                  {formatServiceDate(selectedSlot.serviceDate)}, {formatWindow(selectedSlot.windowStart, selectedSlot.windowEnd)}
                </p>
                <p>
                  {address.addressLine1}
                  {addressLine2 && `, ${addressLine2}`}, Singapore {address.postalCode}
                </p>
              </ReviewRow>
              <ReviewRow label="Contact" onEdit={() => goToStep(2)}>
                <p className="font-bold">{details.customerName}</p>
                <p>
                  {details.email} · +65 {details.phone}
                </p>
                {details.notes && <p className="text-muted-foreground">“{details.notes}”</p>}
              </ReviewRow>
            </section>

            <Alert>
              <InfoIcon />
              <AlertTitle>Demo payment</AlertTitle>
              <AlertDescription>No card is charged. Your order is marked as paid so you can follow it through delivery.</AlertDescription>
            </Alert>

            <div className="flex flex-col gap-3">
              <Button size="cta" className="w-full" onClick={onPay} disabled={placing}>
                {placing && <Spinner data-icon="inline-start" />}
                Pay {formatMoney(totalCents)}
              </Button>
              <Button variant="ghost" size="cta" onClick={() => goToStep(2)} disabled={placing}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>

      <OrderSummary
        lines={lines}
        subtotalCents={subtotalCents}
        feeCents={feeCents}
        gst={gst}
        totalCents={totalCents}
        gstPercent={settings.gstBasisPoints / 100}
      />
    </div>
  );
}

function CheckoutProgress({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-3 gap-2 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index + 1 === step ? "step" : undefined}
            className={index + 1 <= step ? "font-bold" : "text-muted-foreground"}
          >
            {index + 1} · {label}
          </li>
        ))}
      </ol>
      <div className="h-1 w-full bg-sand" aria-hidden>
        <div
          className="h-full bg-ember motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${(step / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-sm border bg-card p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
        {children}
      </div>
      <Button variant="link" className="h-auto p-0 text-brand" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

function OrderSummary({
  lines,
  subtotalCents,
  feeCents,
  gst,
  totalCents,
  gstPercent,
}: {
  lines: CartLine[];
  subtotalCents: number;
  feeCents: number | null;
  gst: number;
  totalCents: number;
  gstPercent: number;
}) {
  return (
    <aside className="flex flex-col gap-4 rounded-sm border bg-card p-6 lg:sticky lg:top-24" aria-label="Order summary">
      <h2 className="font-display text-2xl uppercase">Your order</h2>
      <ul className="flex flex-col gap-3">
        {lines.map(({ item, qty, lineCents }) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span>
              <span className="font-bold tabular-nums">{qty} ×</span> {item.name}
            </span>
            <span className="tabular-nums">{formatMoney(lineCents)}</span>
          </li>
        ))}
      </ul>
      <Separator />
      <dl className="flex flex-col gap-2 text-sm [&_dd]:tabular-nums [&>div]:flex [&>div]:justify-between">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(subtotalCents)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{feeCents === null ? "Enter postal code" : feeCents === 0 ? "Free" : formatMoney(feeCents)}</dd>
        </div>
        <div>
          <dt>GST ({gstPercent}%)</dt>
          <dd>{formatMoney(gst)}</dd>
        </div>
      </dl>
      <Separator />
      <div className="flex items-baseline justify-between">
        <span className="font-bold">Total</span>
        <span className="text-2xl font-bold tabular-nums">{formatMoney(totalCents)}</span>
      </div>
    </aside>
  );
}
