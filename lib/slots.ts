// Bookable delivery slots for checkout. Uncached: capacity changes with every order.

import { publicClient } from "./supabase/clients.ts";

export type Slot = {
  id: string;
  serviceDate: string; // "YYYY-MM-DD" business date
  windowStart: string; // ISO timestamp (UTC)
  windowEnd: string;
  ribsRemaining: number;
};

const MIN_LEAD_MS = 24 * 60 * 60 * 1000; // shortest lead time; Christmas items need longer (filtered client-side)
const HORIZON_DAYS = 90; // get_bookable_slots caps the range at 120 days and 500 rows

/**
 * Open slots from 24 hours ahead. Returns the `nowMs` it filtered with, so the client applies
 * further lead-time rules against the same instant (no server/client clock mismatch).
 * Call after connection(): it reads the current time.
 */
export async function getBookableSlots(): Promise<{ slots: Slot[]; nowMs: number }> {
  const nowMs = Date.now();
  const from = new Date(nowMs + MIN_LEAD_MS).toISOString();
  const to = new Date(nowMs + HORIZON_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Narrow RPC: open slots with remaining ribs only (the table itself isn't publicly readable).
  const { data, error } = await publicClient().rpc("get_bookable_slots", { p_from: from, p_to: to });
  if (error) throw new Error(`Failed to load delivery slots: ${error.message}`);

  const rows = data as {
    id: string;
    service_date: string;
    window_start: string;
    window_end: string;
    ribs_remaining: number;
  }[];
  const slots = rows.map((row) => ({
    id: row.id,
    serviceDate: row.service_date,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    ribsRemaining: row.ribs_remaining,
  }));
  return { slots, nowMs };
}
