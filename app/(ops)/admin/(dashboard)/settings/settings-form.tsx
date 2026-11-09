"use client";

import { useActionState, useEffect } from "react";
import { CircleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import type { AdminSettings } from "@/lib/admin-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { saveSettings, type SettingsState } from "./actions";

const INITIAL: SettingsState = { status: "idle", message: null, fieldErrors: {} };

export function SettingsForm({ settings }: { settings: AdminSettings }) {
  const [state, action, pending] = useActionState(saveSettings, INITIAL);
  const errors = state.fieldErrors;

  useEffect(() => {
    if (state.status === "saved" && state.message) toast.success(state.message);
  }, [state]);

  const field = (
    name: string,
    label: string,
    savedValue: string,
    options: { description?: string; prefix?: string; suffix?: string; inputMode?: "decimal" | "numeric" } = {},
  ) => {
    // After a failed save, show what was typed rather than the saved value.
    const defaultValue = state.status === "error" ? (state.values?.[name] ?? savedValue) : savedValue;
    return (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      {options.prefix || options.suffix ? (
        <InputGroup>
          {options.prefix && <InputGroupAddon>{options.prefix}</InputGroupAddon>}
          <InputGroupInput
            id={name}
            name={name}
            defaultValue={defaultValue}
            inputMode={options.inputMode ?? "decimal"}
            aria-invalid={!!errors[name]}
            className="tabular-nums"
          />
          {options.suffix && <InputGroupAddon align="inline-end">{options.suffix}</InputGroupAddon>}
        </InputGroup>
      ) : (
        <Input
          id={name}
          name={name}
          defaultValue={defaultValue}
          inputMode={options.inputMode}
          aria-invalid={!!errors[name]}
        />
      )}
      {errors[name] ? <FieldError>{errors[name]}</FieldError> : options.description && <FieldDescription>{options.description}</FieldDescription>}
    </Field>
    );
  };

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kitchen (dispatch point)</CardTitle>
          <CardDescription>
            Every delivery run starts here. Currently:{" "}
            <span className="text-foreground">
              {settings.depot_address ?? "placeholder location (central Singapore)"}
            </span>{" "}
            · {settings.depot_lat}, {settings.depot_lng}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="sm:grid sm:grid-cols-2">
            {field("depotName", "Kitchen name", settings.depot_name)}
            {field("depotPostalCode", "Kitchen postal code", "", {
              inputMode: "numeric",
              description: "Leave blank to keep the current location. Looked up on OneMap when you save.",
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery runs</CardTitle>
          <CardDescription>Used by route planning to decide how many Grab cars to book and when they leave.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="sm:grid sm:grid-cols-2">
            {field("vehicleCapacityUnits", "Car capacity", settings.vehicle_capacity_units, {
              suffix: "set boxes",
              description: "How many Beef Rib Set boxes fit in one car (1 set = 1 unit).",
            })}
            {field("serviceMinutesPerStop", "Time per stop", String(settings.service_minutes_per_stop), {
              suffix: "min",
              inputMode: "numeric",
              description: "Parking, lift and handover at each address.",
            })}
            {field("avgSpeedKmh", "Average driving speed", settings.avg_speed_kmh, { suffix: "km/h" })}
            {field("roadFactor", "Road distance factor", settings.road_factor, {
              suffix: "×",
              description: "Road distance ÷ straight-line distance. 1.4 suits Singapore.",
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery fees</CardTitle>
          <CardDescription>
            Orders below the threshold pay base fee + per-km fee (road distance from the kitchen, whole km). GST is{" "}
            {Math.round(Number(settings.gst_rate) * 10_000) / 100}%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="sm:grid sm:grid-cols-3">
            {field("freeDeliveryThreshold", "Free delivery from", settings.free_delivery_threshold, {
              prefix: "$",
              description: "Subtotal before GST.",
            })}
            {field("feeBase", "Base fee", settings.fee_base, { prefix: "$" })}
            {field("feePerKm", "Per km", settings.fee_per_km, { prefix: "$" })}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Save settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
