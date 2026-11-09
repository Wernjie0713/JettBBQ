// Seed Supabase with settings check, menu, delivery slots, geocodes, the demo admin user,
// and the Dec 2025 historical orders. Safe to re-run: existing rows are left untouched.
//
// Usage:
//   npm run data:seed               # writes to Supabase (needs .env.local)
//   npm run data:seed -- --dry-run  # parse and report only, no network

import { existsSync, readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_TIMEZONE } from "../lib/config.ts";
import { zonedTimeToUtc } from "../lib/time.ts";
import { readOrdersCsv, type CsvOrder } from "./lib/orders-csv.ts";
import { check, createAdminClient } from "./lib/supabase-admin.ts";
import { CHRISTMAS_2026, MENU, REGULAR, type SlotTemplate } from "./seed-data.ts";

const CSV_PATH = "data/orders-dec2025-anonymised.csv";
const GEOCODE_PATH = "data/postal-codes.json";
const BATCH_SIZE = 500;
const GST_BASIS_POINTS = 900n; // 9%, matches settings.gst_rate default
const DRY_RUN = process.argv.includes("--dry-run");

type Geocodes = Record<string, { lat: number; lng: number; address: string }>;
type SlotRow = {
  service_date: string;
  window_start: string;
  window_end: string;
  rib_capacity: number;
  ribs_booked: number;
  is_open: boolean;
};

// ---------------------------------------------------------------------------
// Money helpers (integer cents, never floats)
// ---------------------------------------------------------------------------
function toCents(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

function fromCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

/** Split a GST-inclusive total into subtotal + GST (round half up). */
function splitGst(totalInclusive: string): { subtotal: string; gst: string } {
  const total = toCents(totalInclusive);
  const denom = 10_000n + GST_BASIS_POINTS;
  const subtotal = (total * 10_000n * 2n + denom) / (2n * denom);
  return { subtotal: fromCents(subtotal), gst: fromCents(total - subtotal) };
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------
function paymentStatus(paymentType: string) {
  const p = paymentType.toLowerCase();
  if (p.includes("partially refunded")) return "partially_refunded";
  if (p.includes("refunded")) return "refunded";
  if (p.includes("no payment") || p.includes("unpaid")) return "unpaid";
  return "paid";
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// The export repeats the postcode in line 1 ("9 Lornie Walk, Singapore 298664") and fills an empty
// line 2 with "0", "00", "-" or "."; the apps print "Singapore <postal>" themselves.
function cleanAddressLine1(line: string, postalCode: string): string {
  return line.replace(new RegExp(`,?\\s*Singapore\\s+${postalCode}\\s*$`, "i"), "").trim() || line;
}
const cleanAddressLine2 = (line: string) => (/[1-9a-z]/i.test(line) ? line : null);

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const slotKey = (date: string, start: string) => `${date}|${start}`;

function slotRow(date: string, t: SlotTemplate, isOpen: boolean, ribsBooked = 0): SlotRow {
  return {
    service_date: date,
    window_start: zonedTimeToUtc(date, t.start, BUSINESS_TIMEZONE).toISOString(),
    window_end: zonedTimeToUtc(date, t.end, BUSINESS_TIMEZONE).toISOString(),
    rib_capacity: t.ribCapacity,
    ribs_booked: ribsBooked,
    is_open: isOpen,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Build everything in memory first (also used by --dry-run)
// ---------------------------------------------------------------------------
function buildPlan() {
  const { orders, skipped } = readOrdersCsv(CSV_PATH);
  const geocodes: Geocodes = existsSync(GEOCODE_PATH)
    ? JSON.parse(readFileSync(GEOCODE_PATH, "utf8"))
    : {};

  const menuByName = new Map(MENU.map((m) => [m.name, m]));
  const unknownItems = new Set<string>();
  const missingGeocode = new Set<string>();

  // Historical slots, with ribs booked computed from items (cancelled orders excluded).
  const historical = new Map<string, SlotRow>();
  for (const o of orders) {
    const key = slotKey(o.servingDate, o.slotStart);
    const row =
      historical.get(key) ??
      slotRow(o.servingDate, { start: o.slotStart, end: o.slotEnd, ribCapacity: 0 }, false);
    if (paymentStatus(o.paymentType) !== "refunded") {
      for (const item of o.items) {
        const menu = menuByName.get(item.name);
        if (!menu) unknownItems.add(item.name);
        row.ribs_booked += (menu?.rib_units ?? 0) * item.qty;
      }
    }
    row.rib_capacity = row.ribs_booked; // past slots: capacity = what was actually sold
    historical.set(key, row);
    if (!geocodes[o.postalCode]) missingGeocode.add(o.postalCode);
  }

  // Future slots: Christmas 2026 season + regular weekends.
  const future: SlotRow[] = [];
  for (const date of dateRange(CHRISTMAS_2026.from, CHRISTMAS_2026.to)) {
    for (const t of CHRISTMAS_2026.slots) future.push(slotRow(date, t, true));
  }
  for (const range of REGULAR.ranges) {
    for (const date of dateRange(range.from, range.to)) {
      for (const t of REGULAR.byWeekday[weekday(date)] ?? []) future.push(slotRow(date, t, true));
    }
  }

  return { orders, skipped, geocodes, historical: [...historical.values()], future, unknownItems, missingGeocode };
}

// ---------------------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------------------
async function seedMenu(db: SupabaseClient) {
  check("menu", await db.from("menu_items").upsert(MENU, { onConflict: "slug", ignoreDuplicates: true }));
  const rows = check("menu ids", await db.from("menu_items").select("id, name"));
  return new Map((rows as { id: string; name: string }[]).map((r) => [r.name, r.id]));
}

async function seedSlots(db: SupabaseClient, slots: SlotRow[]) {
  for (const batch of chunk(slots, BATCH_SIZE)) {
    check(
      "slots",
      await db.from("delivery_slots").upsert(batch, { onConflict: "service_date,window_start", ignoreDuplicates: true }),
    );
  }
}

async function loadSlotIds(db: SupabaseClient, from: string, to: string) {
  const ids = new Map<string, string>();
  const rows = check(
    "slot ids",
    await db
      .from("delivery_slots")
      .select("id, service_date, window_start")
      .gte("service_date", from)
      .lte("service_date", to)
      .limit(5000),
  ) as { id: string; service_date: string; window_start: string }[];
  for (const r of rows) {
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(r.window_start));
    ids.set(slotKey(r.service_date, local), r.id);
  }
  return ids;
}

async function seedPostalCodes(db: SupabaseClient, geocodes: Geocodes) {
  const rows = Object.entries(geocodes).map(([postal_code, g]) => ({
    postal_code,
    lat: g.lat.toFixed(6),
    lng: g.lng.toFixed(6),
    formatted_address: g.address,
  }));
  for (const batch of chunk(rows, BATCH_SIZE)) {
    check("postal codes", await db.from("postal_codes").upsert(batch, { onConflict: "postal_code", ignoreDuplicates: true }));
  }
  return rows.length;
}

async function seedAdmin(db: SupabaseClient) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("Admin user: skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.local)");
    return;
  }
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (!created.error) {
    console.log(`Admin user: created ${email}`);
    return;
  }
  // Already exists: make sure it carries the admin role.
  const list = check("list users", await db.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw created.error;
  check(
    "admin role",
    await db.auth.admin.updateUserById(existing.id, { app_metadata: { ...existing.app_metadata, role: "admin" } }),
  );
  console.log(`Admin user: ${email} already existed, admin role ensured`);
}

async function seedOrders(
  db: SupabaseClient,
  orders: CsvOrder[],
  geocodes: Geocodes,
  slotIds: Map<string, string>,
  menuIds: Map<string, string>,
) {
  const existing = new Set<string>();
  // Smaller batches here: the codes travel in the request URL.
  for (const batch of chunk(orders.map((o) => o.code), 200)) {
    const rows = check("existing orders", await db.from("orders").select("code").in("code", batch));
    for (const r of rows as { code: string }[]) existing.add(r.code);
  }
  const todo = orders.filter((o) => !existing.has(o.code));
  const menuByName = new Map(MENU.map((m) => [m.name, m]));
  let inserted = 0;

  for (const batch of chunk(todo, BATCH_SIZE)) {
    const rows = batch.map((o) => {
      const slotId = slotIds.get(slotKey(o.servingDate, o.slotStart));
      if (!slotId) throw new Error(`No slot for ${o.code} (${o.servingDate} ${o.slotStart})`);
      const geo = geocodes[o.postalCode];
      const payment = paymentStatus(o.paymentType);
      const { subtotal, gst } = splitGst(o.total);
      return {
        code: o.code,
        slot_id: slotId,
        source: "import",
        status: payment === "refunded" ? "cancelled" : "confirmed",
        customer_name: o.contactName || "Customer",
        email: o.contactEmail,
        phone: o.contactNumber,
        address_line1: cleanAddressLine1(o.addressLine1, o.postalCode),
        address_line2: cleanAddressLine2(o.addressLine2),
        postal_code: o.postalCode,
        lat: geo ? geo.lat.toFixed(6) : null,
        lng: geo ? geo.lng.toFixed(6) : null,
        notes: null, // customer notes were removed in the anonymised export
        subtotal,
        delivery_fee: "0.00", // not in the export; totals are GST-inclusive
        gst,
        total: o.total,
        payment_status: payment,
        payment_method: o.paymentType.replace(/\s*\(.*\)$/, "").slice(0, 60),
        created_at: zonedTimeToUtc(o.orderDate, "00:00", BUSINESS_TIMEZONE).toISOString(),
      };
    });

    const ids = check("orders", await db.from("orders").insert(rows).select("id, code")) as { id: string; code: string }[];
    const idByCode = new Map(ids.map((r) => [r.code, r.id]));

    const items = batch.flatMap((o) =>
      o.items.map((item) => {
        const menu = menuByName.get(item.name);
        const unit = menu?.price ?? "0.00";
        return {
          order_id: idByCode.get(o.code),
          menu_item_id: menuIds.get(item.name) ?? null,
          name_snapshot: item.name.slice(0, 120),
          unit_price: unit,
          qty: item.qty,
          line_total: fromCents(toCents(unit) * BigInt(item.qty)),
          rib_units: menu?.rib_units ?? 0, // same value buildPlan() counted into the slot's ribs_booked
        };
      }),
    );
    check("order items", await db.from("order_items").insert(items));
    inserted += batch.length;
    console.log(`Orders: ${inserted}/${todo.length}`);
  }
  return { inserted, alreadyPresent: existing.size };
}

// ---------------------------------------------------------------------------
async function main() {
  const plan = buildPlan();
  const ribsPerSlot = plan.historical
    .map((s) => ({ key: `${s.service_date} ${s.window_start}`, ribs: s.ribs_booked }))
    .sort((a, b) => b.ribs - a.ribs)
    .slice(0, 3);

  console.log(`Orders parsed: ${plan.orders.length}, skipped: ${plan.skipped.length}`);
  for (const s of plan.skipped) console.log(`  skipped ${s}`);
  console.log(`Menu items: ${MENU.length}`);
  console.log(`Slots: ${plan.historical.length} historical, ${plan.future.length} future`);
  console.log(`Busiest historical slots (ribs):`, ribsPerSlot);
  console.log(`Geocodes cached: ${Object.keys(plan.geocodes).length}, missing for orders: ${plan.missingGeocode.size}`);
  if (plan.unknownItems.size) console.log(`Items with no menu match: ${[...plan.unknownItems].join(", ")}`);
  console.log(`Sample GST split of 212.55:`, splitGst("212.55"));

  if (DRY_RUN) {
    console.log("Dry run: nothing written.");
    return;
  }

  const db = createAdminClient();
  const settings = check("settings", await db.from("settings").select("id").limit(1));
  if (!(settings as unknown[]).length) throw new Error("settings row missing; run the migration first (npm run db:push)");

  const menuIds = await seedMenu(db);
  console.log(`Menu: ${menuIds.size} items in database`);
  await seedSlots(db, [...plan.historical, ...plan.future]);
  const slotIds = await loadSlotIds(db, "2025-11-01", "2026-01-31");
  console.log(`Slots: seeded (${slotIds.size} historical-period slots found)`);
  console.log(`Postal codes: ${await seedPostalCodes(db, plan.geocodes)} upserted`);
  await seedAdmin(db);
  const result = await seedOrders(db, plan.orders, plan.geocodes, slotIds, menuIds);
  console.log(`Orders: ${result.inserted} inserted, ${result.alreadyPresent} already present`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
