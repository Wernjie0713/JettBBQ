// Back-office queries. Every function takes the admin's session client from requireAdmin(),
// so RLS applies as that user. All lists are bounded.

import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./supabase/check.ts";

export type OrderStatus = "confirmed" | "planned" | "out_for_delivery" | "delivered" | "failed" | "cancelled";
export const ORDER_STATUSES: OrderStatus[] = [
  "confirmed",
  "planned",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
];

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export type SlotSummary = {
  slot_id: string;
  window_start: string;
  window_end: string;
  is_open: boolean;
  rib_capacity: number;
  ribs_booked: number;
  active_orders: number;
  cancelled_orders: number;
  revenue: string; // decimal text
};

export async function getDaySummary(db: SupabaseClient, date: string): Promise<SlotSummary[]> {
  return check("admin_day_summary", await db.rpc("admin_day_summary", { p_date: date }));
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export const ORDERS_PAGE_SIZE = 50;

export type OrderCursor = { createdAt: string; id: string };

export type OrderListFilters = {
  status?: OrderStatus;
  date?: string; // service date
  q?: string; // order code or postal code
  after?: OrderCursor; // the page of orders older than this one
  before?: OrderCursor; // the page of orders newer than this one
};

export type OrderListRow = {
  id: string;
  code: string;
  status: OrderStatus;
  source: "web" | "import";
  customer_name: string;
  postal_code: string;
  total: string;
  is_zero_value: boolean; // $0 order (comp or manual entry), kept but flagged
  created_at: string;
  delivery_slots: { service_date: string; window_start: string; window_end: string };
};

/**
 * Newest first, keyset-paginated on (created_at, id) — matches orders_created_at_id index.
 * `prevCursor` / `nextCursor` are null when there are no newer / older orders.
 */
export async function listOrders(
  db: SupabaseClient,
  filters: OrderListFilters,
): Promise<{ rows: OrderListRow[]; total: number; prevCursor: string | null; nextCursor: string | null }> {
  const filtered = (options?: { count: "exact"; head: true }) => {
    let query = db
      .from("orders")
      .select(
        "id, code, status, source, customer_name, postal_code, total::text, is_zero_value, created_at, delivery_slots!inner(service_date, window_start, window_end)",
        options,
      );
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.date) query = query.eq("delivery_slots.service_date", filters.date);
    if (filters.q) {
      query = /^\d{6}$/.test(filters.q) ? query.eq("postal_code", filters.q) : query.eq("code", filters.q.toUpperCase());
    }
    return query;
  };

  // Going back a page reads newer orders oldest-first from the cursor, then flips them.
  const newer = Boolean(filters.before);
  let page = filtered()
    .order("created_at", { ascending: newer })
    .order("id", { ascending: newer })
    .limit(ORDERS_PAGE_SIZE + 1);
  const cursor = filters.before ?? filters.after;
  if (cursor) {
    const op = newer ? "gt" : "lt";
    page = page.or(`created_at.${op}.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.${op}.${cursor.id})`);
  }

  // Exact count over the filtered set: cheap at this business's volume (thousands of orders a
  // season). If orders ever reach millions, switch to count: "estimated".
  const [pageResult, countResult] = await Promise.all([page, filtered({ count: "exact", head: true })]);
  const data = check<OrderListRow[]>("listOrders", pageResult);
  if (countResult.error) throw new Error(`listOrders count: ${countResult.error.message}`);

  const hasMore = data.length > ORDERS_PAGE_SIZE;
  const rows = data.slice(0, ORDERS_PAGE_SIZE);
  if (newer) rows.reverse();
  const first = rows[0];
  const last = rows[rows.length - 1];
  // Arriving from a cursor proves there are orders on that side of this page.
  const hasNewer = newer ? hasMore : Boolean(filters.after);
  const hasOlder = newer ? true : hasMore;
  return {
    rows,
    total: countResult.count ?? 0,
    prevCursor: hasNewer && first ? encodeCursor(first.created_at, first.id) : null,
    nextCursor: hasOlder && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}

/** Cursors come from the URL: validate before they reach a query. */
export function decodeCursor(value: string | undefined): OrderCursor | undefined {
  if (!value || value.length > 200) return undefined;
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown[];
    if (
      typeof createdAt === "string" &&
      !Number.isNaN(Date.parse(createdAt)) &&
      /^[\d\-T:.+Z ]+$/.test(createdAt) &&
      typeof id === "string" &&
      /^[0-9a-f-]{36}$/.test(id)
    ) {
      return { createdAt, id };
    }
  } catch {
    // fall through
  }
  return undefined;
}

export type OrderDetail = {
  id: string;
  code: string;
  status: OrderStatus;
  source: "web" | "import";
  customer_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  driver_note: string | null;
  subtotal: string;
  delivery_fee: string;
  gst: string;
  total: string;
  is_zero_value: boolean;
  payment_status: string;
  payment_method: string | null;
  tracking_token: string;
  created_at: string;
  slot: { id: string; service_date: string; window_start: string; window_end: string };
  items: { id: string; name_snapshot: string; unit_price: string; qty: number; line_total: string }[];
};

export async function getOrder(db: SupabaseClient, id: string): Promise<OrderDetail | null> {
  return check(
    "getOrder",
    await db
      .from("orders")
      .select(
        "id, code, status, source, customer_name, email, phone, address_line1, address_line2, postal_code, lat, lng, notes, driver_note, subtotal::text, delivery_fee::text, gst::text, total::text, is_zero_value, payment_status, payment_method, tracking_token, created_at, slot:delivery_slots!inner(id, service_date, window_start, window_end), items:order_items(id, name_snapshot, unit_price::text, qty, line_total::text)",
      )
      .eq("id", id)
      .maybeSingle(),
  );
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------
export type AdminSlot = {
  id: string;
  service_date: string;
  window_start: string;
  window_end: string;
  rib_capacity: number;
  ribs_booked: number;
  is_open: boolean;
};

/** Slots for [from, to] inclusive. ~5 slots/day, so a 2-week window stays small. */
export async function listSlots(db: SupabaseClient, from: string, to: string): Promise<AdminSlot[]> {
  return check(
    "listSlots",
    await db
      .from("delivery_slots")
      .select("id, service_date, window_start, window_end, rib_capacity, ribs_booked, is_open")
      .gte("service_date", from)
      .lte("service_date", to)
      .order("window_start")
      .limit(500),
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export type AdminSettings = {
  depot_name: string;
  depot_address: string | null;
  depot_lat: string;
  depot_lng: string;
  vehicle_capacity_units: string;
  service_minutes_per_stop: number;
  avg_speed_kmh: string;
  road_factor: string;
  gst_rate: string;
  free_delivery_threshold: string;
  fee_base: string;
  fee_per_km: string;
  updated_at: string;
};

export async function getSettings(db: SupabaseClient): Promise<AdminSettings> {
  return check(
    "getSettings",
    await db
      .from("settings")
      .select(
        "depot_name, depot_address, depot_lat::text, depot_lng::text, vehicle_capacity_units::text, service_minutes_per_stop, avg_speed_kmh::text, road_factor::text, gst_rate::text, free_delivery_threshold::text, fee_base::text, fee_per_km::text, updated_at",
      )
      .single(),
  );
}
