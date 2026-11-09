// The few business settings the shop UI shows (free-delivery threshold, GST rate).
// The settings table is admin-only, so this reads with the secret key on the server and exposes
// only these two values. Final amounts are always computed again by place_order.

import { cacheLife, cacheTag } from "next/cache";
import { toCents } from "./format.ts";
import { adminClient } from "./supabase/clients.ts";

export type ShopSettings = {
  freeDeliveryThresholdCents: number;
  gstBasisPoints: number; // 9% = 900
};

export async function getShopSettings(): Promise<ShopSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");

  const { data, error } = await adminClient()
    .from("settings")
    .select("free_delivery_threshold::text, gst_rate::text")
    .single();
  if (error) throw new Error(`Failed to load settings: ${error.message}`);

  const row = data as { free_delivery_threshold: string; gst_rate: string };
  // gst_rate is numeric(5,4): "0.0900" → 900 basis points, without floats.
  const [whole, fraction = ""] = row.gst_rate.split(".");
  return {
    freeDeliveryThresholdCents: toCents(row.free_delivery_threshold),
    gstBasisPoints: Number(whole) * 10_000 + Number(fraction.padEnd(4, "0").slice(0, 4)),
  };
}
