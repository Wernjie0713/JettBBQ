"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toCents } from "@/lib/format";
import { lookupPostalCode } from "@/lib/onemap";
import { MAX_CART_LINES, MAX_QTY_PER_ITEM } from "@/lib/order-limits";
import { knownErrorMessage } from "@/lib/supabase/check";
import { adminClient, publicClient } from "@/lib/supabase/clients";

const ONEMAP_TIMEOUT_MS = 5_000; // the customer is waiting on this

// ---------------------------------------------------------------------------
// Postal code → address + delivery fee
// ---------------------------------------------------------------------------
export type AddressResult =
  | { ok: true; postalCode: string; addressLine1: string; deliveryFeeCents: number }
  | { ok: false; message: string };

const postalCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit Singapore postal code.");

/** "11 BALMORAL ROAD SINGAPORE 259797" → "11 Balmoral Road" */
function toAddressLine(formatted: string, postalCode: string): string {
  const withoutCountry = formatted.replace(new RegExp(`\\s*SINGAPORE\\s+${postalCode}\\s*$`, "i"), "").trim();
  const line = withoutCountry || `Singapore ${postalCode}`;
  return line.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export async function lookupAddress(rawPostalCode: string): Promise<AddressResult> {
  const parsed = postalCodeSchema.safeParse(rawPostalCode);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const postalCode = parsed.data;

  try {
    // Cache first: most customers live at postal codes we have seen before.
    const { data: cached, error } = await adminClient()
      .from("postal_codes")
      .select("formatted_address")
      .eq("postal_code", postalCode)
      .maybeSingle();
    if (error) throw new Error(`postal_codes read failed: ${error.message}`);

    let formatted = cached?.formatted_address as string | null | undefined;
    if (!cached) {
      const found = await lookupPostalCode(postalCode, ONEMAP_TIMEOUT_MS);
      if (!found) {
        return { ok: false, message: "We couldn't find that postal code. Please check it, or WhatsApp us." };
      }
      const { error: upsertError } = await adminClient()
        .from("postal_codes")
        .upsert(
          { postal_code: postalCode, lat: found.lat, lng: found.lng, formatted_address: found.address },
          { onConflict: "postal_code", ignoreDuplicates: true },
        );
      if (upsertError) throw new Error(`postal_codes upsert failed: ${upsertError.message}`);
      formatted = found.address;
    }

    // Fee for an order below the free-delivery threshold; the client applies the threshold.
    const { data: quote, error: quoteError } = await publicClient().rpc("quote_delivery", {
      p_postal_code: postalCode,
      p_subtotal: 0,
    });
    if (quoteError) throw new Error(`quote_delivery failed: ${quoteError.message}`);
    const result = quote as { found: boolean; fee: string | null };
    if (!result.found || result.fee === null) throw new Error("quote_delivery returned no fee");

    return {
      ok: true,
      postalCode,
      addressLine1: toAddressLine(formatted ?? "", postalCode),
      deliveryFeeCents: toCents(result.fee),
    };
  } catch (error) {
    console.error("lookupAddress failed", { postalCode }, error);
    return { ok: false, message: "Address lookup is not responding right now. Please try again in a moment." };
  }
}

// ---------------------------------------------------------------------------
// Place order
// ---------------------------------------------------------------------------
const orderSchema = z.object({
  idempotencyKey: z.uuid(),
  slotId: z.uuid(),
  items: z
    .array(z.object({ id: z.uuid(), qty: z.number().int().min(1).max(MAX_QTY_PER_ITEM) }))
    .min(1, "Your cart is empty.")
    .max(MAX_CART_LINES),
  customerName: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.email("Enter a valid email.").max(254),
  phone: z
    .string()
    .trim()
    .regex(/^[3689]\d{7}$/, "Enter an 8-digit Singapore number."),
  postalCode: postalCodeSchema,
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: z.string().trim().max(300),
  notes: z.string().trim().max(1000),
});

export type OrderInput = z.input<typeof orderSchema>;

export type PlaceOrderResult =
  | { ok: true; trackingToken: string; code: string }
  | { ok: false; message: string; field?: string; refreshSlots?: boolean };

const ERRORS: Record<string, { message: string; refreshSlots?: boolean }> = {
  INVALID_INPUT: { message: "Some details don't look right. Please check the form and try again." },
  ADDRESS_NOT_FOUND: { message: "We couldn't confirm your address. Please search your postal code again." },
  SLOT_UNAVAILABLE: { message: "That delivery slot is no longer open. Please pick another time.", refreshSlots: true },
  SLOT_FULL: { message: "That slot just filled up. Please pick another time below.", refreshSlots: true },
  TOO_LATE: {
    message: "That slot is now too soon to prepare for (24 hours ahead, 3 days for Christmas). Please pick a later time.",
    refreshSlots: true,
  },
  ITEM_UNAVAILABLE: { message: "Something in your cart isn't available on that date. Please pick another date or update your cart." },
};

export async function placeOrder(input: OrderInput): Promise<PlaceOrderResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue.message, field: String(issue.path[0] ?? "") };
  }
  const o = parsed.data;

  const { data, error } = await publicClient().rpc("place_order", {
    p: {
      idempotency_key: o.idempotencyKey,
      slot_id: o.slotId,
      items: o.items.map((i) => ({ menu_item_id: i.id, qty: i.qty })),
      customer_name: o.customerName,
      email: o.email,
      phone: `+65 ${o.phone}`,
      postal_code: o.postalCode,
      address_line1: o.addressLine1,
      address_line2: o.addressLine2,
      notes: o.notes,
    },
  });

  if (error) {
    const known = knownErrorMessage(error, ERRORS);
    if (!known) {
      console.error("place_order failed", { slotId: o.slotId, idempotencyKey: o.idempotencyKey }, error);
      return { ok: false, message: "We couldn't place your order. Please try again — you won't be charged twice." };
    }
    if (known.refreshSlots) refresh(); // re-render the page so slot capacity is current
    return { ok: false, ...known };
  }

  const result = data as { code: string; tracking_token: string };
  return { ok: true, code: result.code, trackingToken: result.tracking_token };
}
