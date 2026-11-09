// Put the Dec 2025 replay data back to "nothing dispatched yet", so every demo starts from an
// unplanned 24 Dec 5pm slot. Deletes delivery runs (and their stops, by cascade) on Dec 2025
// slots and sets imported orders there back to Confirmed. Cancelled orders, customer (web)
// orders and every other month are untouched. Safe to re-run.
//
// Usage:
//   npm run demo:reset               # writes to Supabase (needs .env.local)
//   npm run demo:reset -- --dry-run  # count only, nothing written

import { check, createAdminClient } from "./lib/supabase-admin.ts";

const FROM = "2025-12-01";
const TO = "2025-12-31";
const DISPATCHED = ["planned", "out_for_delivery", "delivered", "failed"];
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const db = createAdminClient();

  const slots = check(
    "slots",
    await db.from("delivery_slots").select("id").gte("service_date", FROM).lte("service_date", TO).limit(500),
  ) as { id: string }[];
  const slotIds = slots.map((s) => s.id);
  if (slotIds.length === 0) {
    console.log(`No slots between ${FROM} and ${TO}; nothing to reset.`);
    return;
  }

  // Head-only count queries: data is null, the number is on `count`.
  const runs = await db.from("delivery_runs").select("id", { count: "exact", head: true }).in("slot_id", slotIds);
  check("count runs", runs);
  const orders = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("slot_id", slotIds)
    .eq("source", "import")
    .in("status", DISPATCHED);
  check("count orders", orders);

  console.log(
    `Dec 2025: ${slotIds.length} slots, ${runs.count ?? 0} delivery runs, ${orders.count ?? 0} orders to set back to Confirmed`,
  );
  if (DRY_RUN) {
    console.log("Dry run: nothing written.");
    return;
  }

  check("delete runs", await db.from("delivery_runs").delete().in("slot_id", slotIds));
  check(
    "reset orders",
    await db
      .from("orders")
      .update({ status: "confirmed" })
      .in("slot_id", slotIds)
      .eq("source", "import")
      .in("status", DISPATCHED),
  );
  console.log("Done. Dec 2025 slots are back to unplanned.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
