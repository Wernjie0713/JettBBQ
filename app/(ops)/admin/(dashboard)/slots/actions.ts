"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

export type SlotActionResult = { ok: true } | { ok: false; message: string };

const updateSchema = z.object({
  id: z.uuid(),
  isOpen: z.boolean().optional(),
  ribCapacity: z.number().int().min(0).max(10_000).optional(),
});

export async function updateSlot(input: z.input<typeof updateSchema>): Promise<SlotActionResult> {
  const { db } = await requireAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid slot update." };
  const { id, isOpen, ribCapacity } = parsed.data;

  const patch: { is_open?: boolean; rib_capacity?: number } = {};
  if (isOpen !== undefined) patch.is_open = isOpen;
  if (ribCapacity !== undefined) patch.rib_capacity = ribCapacity;
  if (Object.keys(patch).length === 0) return { ok: true };

  let query = db.from("delivery_slots").update(patch).eq("id", id);
  // Capacity can't drop below ribs already sold. Checked in the same UPDATE, so a concurrent
  // order (which locks the row in place_order) can't slip in between check and write.
  if (ribCapacity !== undefined) query = query.lte("ribs_booked", ribCapacity);

  const { data, error } = await query.select("id");
  if (error) {
    console.error("updateSlot failed", { id, patch }, error);
    return { ok: false, message: "Couldn't save the slot. Please try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "Capacity can't be lower than the ribs already booked." };
  }
  refresh();
  return { ok: true };
}
