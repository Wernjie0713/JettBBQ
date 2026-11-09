"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { knownErrorMessage } from "@/lib/supabase/check";

export type CancelResult = { ok: true; message: string } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "That order no longer exists.",
  NOT_CANCELLABLE: "This order is already out for delivery or finished, so it can't be cancelled here.",
  FORBIDDEN: "Your account can't cancel orders.",
};

export async function cancelOrder(orderId: string): Promise<CancelResult> {
  const { db } = await requireAdmin(); // re-authorise inside every action
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { ok: false, message: "Invalid order." };

  const { data, error } = await db.rpc("admin_cancel_order", { p_order_id: id.data });
  if (error) {
    const message = knownErrorMessage(error, MESSAGES);
    if (!message) console.error("admin_cancel_order failed", { orderId: id.data }, error);
    return { ok: false, message: message ?? "Couldn't cancel the order. Please try again." };
  }
  refresh();
  return {
    ok: true,
    message: data === "ALREADY_CANCELLED" ? "Order was already cancelled." : "Order cancelled, ribs released and payment marked refunded.",
  };
}
