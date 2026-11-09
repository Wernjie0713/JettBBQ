"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { lookupPostalCode } from "@/lib/onemap";

export type SettingsState = {
  status: "idle" | "saved" | "error";
  message: string | null;
  fieldErrors: Record<string, string>;
  /** What was submitted, so a failed save doesn't wipe the form (React resets forms after an action). */
  values?: Record<string, string>;
};

/** Decimal kept as a string (exact, straight into a numeric column), bounds-checked. */
const decimal = (label: string, min: number, max: number, scale = 2) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{1,6}(\\.\\d{1,${scale}})?$`), `${label}: enter a number with up to ${scale} decimals.`)
    .refine((v) => Number(v) >= min && Number(v) <= max, `${label} must be between ${min} and ${max}.`);

const settingsSchema = z.object({
  depotName: z.string().trim().min(1, "Kitchen name is required.").max(120),
  depotPostalCode: z
    .string()
    .trim()
    .regex(/^(\d{6})?$/, "Enter a 6-digit postal code, or leave it blank to keep the current location."),
  vehicleCapacityUnits: decimal("Car capacity", 0.5, 100),
  serviceMinutesPerStop: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, "Time per stop: enter whole minutes.") // not z.coerce: "" would become 0
    .transform(Number)
    .refine((n) => n <= 60, "Time per stop must be 60 minutes or less."),
  avgSpeedKmh: decimal("Average speed", 5, 120),
  roadFactor: decimal("Road factor", 1, 3),
  freeDeliveryThreshold: decimal("Free delivery threshold", 0, 100_000),
  feeBase: decimal("Base fee", 0, 1_000),
  feePerKm: decimal("Fee per km", 0, 100),
});

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { db } = await requireAdmin();
  const raw = Object.fromEntries(formData);
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v).slice(0, 200)]));
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const s = parsed.data;

  const patch: Record<string, string | number> = {
    depot_name: s.depotName,
    vehicle_capacity_units: s.vehicleCapacityUnits,
    service_minutes_per_stop: s.serviceMinutesPerStop,
    avg_speed_kmh: s.avgSpeedKmh,
    road_factor: s.roadFactor,
    free_delivery_threshold: s.freeDeliveryThreshold,
    fee_base: s.feeBase,
    fee_per_km: s.feePerKm,
    updated_at: new Date().toISOString(),
  };

  if (s.depotPostalCode) {
    try {
      const found = await lookupPostalCode(s.depotPostalCode, 5_000);
      if (!found) {
        return { status: "error", message: null, fieldErrors: { depotPostalCode: "OneMap doesn't know that postal code." }, values };
      }
      patch.depot_lat = found.lat;
      patch.depot_lng = found.lng;
      patch.depot_address = found.address;
    } catch (error) {
      console.error("Depot postal code lookup failed", { postalCode: s.depotPostalCode }, error);
      return {
        status: "error",
        message: "Address lookup isn't responding. Try again, or save without changing the postal code.",
        fieldErrors: {},
        values,
      };
    }
  }

  const { data, error } = await db.from("settings").update(patch).eq("id", true).select("id");
  if (error || !data?.length) {
    console.error("saveSettings failed", error);
    return { status: "error", message: "Couldn't save settings. Please try again.", fieldErrors: {}, values };
  }

  updateTag("settings"); // the shop caches the free-delivery threshold and GST rate
  refresh();
  return { status: "saved", message: "Settings saved.", fieldErrors: {} };
}
