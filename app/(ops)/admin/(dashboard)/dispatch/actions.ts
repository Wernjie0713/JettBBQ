"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AiError } from "@/lib/ai/openai";
import { summarisePlan, translateInstruction, type PlanNumbers } from "@/lib/ai/copilot";
import { getSettings } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import {
  getDispatchOrders,
  getDispatchSlot,
  getRuns,
  planErrorMessage,
  routableStops,
  routingParams,
  savedPlanNumbers,
  savePayload,
  slotConstraints,
  type DispatchOrder,
  type RunStatus,
} from "@/lib/dispatch";
import { describeRules, EMPTY_RULES, rulesSchema, type DispatchRules } from "@/lib/dispatch-rules";
import { formatWindow } from "@/lib/format";
import { optimise, sequenceRuns, type Plan, type RoutingStop } from "@/lib/routing/optimise";

export type DispatchActionResult = { ok: true; message: string; warnings: string[] } | { ok: false; message: string };

const NOT_PLANNABLE = "Only orders that haven't left the kitchen can be planned.";

/** Load everything the optimiser needs for one slot, as the signed-in admin. */
async function loadSlot(slotId: string) {
  const { db } = await requireAdmin();
  const slot = await getDispatchSlot(db, slotId);
  if (!slot) return null;
  const [settings, orders, runs] = await Promise.all([getSettings(db), getDispatchOrders(db, slotId), getRuns(db, slotId)]);
  return { db, slot, params: routingParams(settings, slot), orders, runs };
}

async function savePlan(
  db: Awaited<ReturnType<typeof requireAdmin>>["db"],
  slotId: string,
  runs: ReturnType<typeof savePayload>,
) {
  const { error } = await db.rpc("admin_save_plan", { p_slot_id: slotId, p_runs: runs });
  if (error) {
    console.error("admin_save_plan failed", { slotId, runs: runs.length }, error);
    return planErrorMessage(error.message);
  }
  return null;
}

type SlotData = NonNullable<Awaited<ReturnType<typeof loadSlot>>>;

/** Optimise the slot under the dispatcher's rules and save it. Returns an error message or the plan. */
async function planSlot(data: SlotData, rules: DispatchRules): Promise<{ error: string } | { plan: Plan; ignored: string[] }> {
  const stops = routableStops(data.orders);
  if (stops.length === 0) return { error: "No orders with a known address to plan in this slot." };

  const { constraints, unknownCodes } = slotConstraints(rules, data.orders, data.slot.service_date);

  const plan = optimise(stops, data.params, constraints);
  const failed = await savePlan(data.db, data.slot.id, savePayload(plan.runs));
  if (failed) return { error: failed };
  return { plan, ignored: unknownCodes };
}

const plannedMessage = (plan: Plan) =>
  `Planned ${plan.metrics.stops} stops in ${plan.metrics.cars} ${plan.metrics.cars === 1 ? "car" : "cars"}.`;

const ignoredWarning = (codes: string[]) =>
  codes.length > 0 ? [`Rules for ${codes.join(", ")} were skipped: not plannable in this slot.`] : [];

/**
 * Plan the whole slot from scratch, under the copilot's current rules if any. Replaces existing
 * runs (and their driver details).
 */
export async function optimiseSlot(slotId: string, rules: DispatchRules = EMPTY_RULES): Promise<DispatchActionResult> {
  const parsedRules = rulesSchema.safeParse(rules);
  if (!z.uuid().safeParse(slotId).success || !parsedRules.success) return { ok: false, message: "Invalid request." };
  const data = await loadSlot(slotId);
  if (!data) return { ok: false, message: "That delivery slot no longer exists." };

  const result = await planSlot(data, parsedRules.data);
  if ("error" in result) return { ok: false, message: result.error };

  refresh();
  return { ok: true, message: plannedMessage(result.plan), warnings: [...result.plan.warnings, ...ignoredWarning(result.ignored)] };
}

// ---------------------------------------------------------------------------
// AI copilot
// ---------------------------------------------------------------------------
export type CopilotResult =
  | { ok: true; reply: string; rules: DispatchRules; changed: boolean; warnings: string[] }
  | { ok: false; message: string };

const askSchema = z.object({
  slotId: z.uuid(),
  message: z.string().trim().min(1).max(500),
  rules: rulesSchema,
});

/** The saved plan's numbers, judged by the rules it was planned under (deadlines included). */
function currentNumbers(data: SlotData, rules: DispatchRules): PlanNumbers | null {
  if (data.runs.length === 0) return null;
  const { deadlines } = slotConstraints(rules, data.orders, data.slot.service_date).constraints;
  const numbers = savedPlanNumbers(data.runs, data.slot.window_end, deadlines);
  return { ...numbers, totalKm: Math.round(numbers.totalKm * 10) / 10 };
}

const copilotOrders = (orders: DispatchOrder[], routable: Set<string>) =>
  orders
    .filter((o) => routable.has(o.id))
    .map((o) => ({ code: o.code, postal_code: o.postal_code, street: o.address_line1, boxes: Math.round(o.load * 10) / 10 }));

/** Dispatcher instruction → validated rules (AI) → optimiser → saved plan → plain-English summary (AI). */
export async function askCopilot(input: z.input<typeof askSchema>): Promise<CopilotResult> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Type an instruction of up to 500 characters." };
  const { slotId, message, rules } = parsed.data;

  const data = await loadSlot(slotId);
  if (!data) return { ok: false, message: "That delivery slot no longer exists." };
  if (data.runs.some((r) => r.status === "in_progress" || r.status === "completed")) {
    return { ok: false, message: planErrorMessage("PLAN_LOCKED") };
  }

  const routable = new Set(routableStops(data.orders).map((s) => s.id));
  let translation;
  try {
    translation = await translateInstruction({
      instruction: message,
      currentRules: rules,
      slot: {
        date: data.slot.service_date,
        window: formatWindow(data.slot.window_start, data.slot.window_end),
        carCapacityBoxes: data.params.vehicleCapacity,
      },
      orders: copilotOrders(data.orders, routable),
    });
  } catch (error) {
    console.error("Copilot translation failed", { slotId, kind: error instanceof AiError ? error.kind : "unknown" }, error);
    return { ok: false, message: "The copilot couldn't answer just now. You can still optimise and move stops by hand." };
  }

  const changed = JSON.stringify(translation.rules) !== JSON.stringify(rules);
  if (translation.question && !changed) {
    return { ok: true, reply: translation.question, rules, changed: false, warnings: [] };
  }

  const before = currentNumbers(data, rules);
  const result = await planSlot(data, translation.rules);
  if ("error" in result) return { ok: false, message: result.error };
  refresh();

  const warnings = [...result.plan.warnings, ...ignoredWarning(result.ignored)];
  const after: PlanNumbers = {
    cars: result.plan.metrics.cars,
    stops: result.plan.metrics.stops,
    totalKm: Math.round(result.plan.metrics.totalKm * 10) / 10,
    lateStops: result.plan.metrics.lateStops,
  };
  let reply: string;
  try {
    reply = await summarisePlan({
      instruction: message,
      rules: describeRules(translation.rules),
      before,
      after,
      warnings,
      ignoredOrders: result.ignored,
    });
  } catch (error) {
    // The plan is already saved; fall back to a plain summary rather than failing the request.
    console.error("Copilot summary failed", { slotId }, error);
    reply = `${translation.understood} ${plannedMessage(result.plan)} ${after.totalKm} km, ${after.lateStops} late.`;
  }
  return { ok: true, reply, rules: translation.rules, changed: true, warnings };
}

const moveSchema = z.object({
  slotId: z.uuid(),
  orderId: z.uuid(),
  target: z.union([z.uuid(), z.literal("new")]),
  rules: rulesSchema,
});

/**
 * Move one order to another run (or a new one), then re-sequence the runs under the copilot's
 * current rules (deadlines, first/last stop, car capacity). The dispatcher's choice of run wins;
 * any run-membership rule the move breaks comes back as a warning.
 */
export async function moveStop(input: z.input<typeof moveSchema>): Promise<DispatchActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid move." };
  const { slotId, orderId, target, rules } = parsed.data;

  const data = await loadSlot(slotId);
  if (!data) return { ok: false, message: "That delivery slot no longer exists." };

  const stopById = new Map(routableStops(data.orders).map((s) => [s.id, s]));
  const moving = stopById.get(orderId);
  if (!moving) return { ok: false, message: NOT_PLANNABLE };
  if (target !== "new" && !data.runs.some((r) => r.id === target)) {
    return { ok: false, message: "That run no longer exists. Reload the page." };
  }

  // Current membership in current order, minus the moving stop; then add it to the target.
  const groups: RoutingStop[][] = data.runs.map((run) =>
    run.stops.map((s) => stopById.get(s.order_id)).filter((s): s is RoutingStop => !!s && s.id !== orderId),
  );
  const ids: (string | null)[] = data.runs.map((r) => r.id);
  if (target === "new") {
    groups.push([moving]);
    ids.push(null);
  } else {
    groups[ids.indexOf(target)].push(moving);
  }

  const { constraints } = slotConstraints(rules, data.orders, data.slot.service_date);
  const plan = sequenceRuns(groups, data.params, constraints);
  const failed = await savePlan(data.db, slotId, savePayload(plan.runs, ids));
  if (failed) return { ok: false, message: failed };

  refresh();
  return { ok: true, message: "Stop moved and runs re-sequenced.", warnings: plan.warnings };
}

const driverSchema = z.object({
  runId: z.uuid(),
  name: z.string().trim().max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9][0-9 ]{6,18})?$/, "Enter a phone number like +65 9123 4567."),
  plate: z.string().trim().toUpperCase().max(16),
});

/** Record the Grab driver for a run. A named driver marks a planned run as assigned. */
export async function saveDriver(input: z.input<typeof driverSchema>): Promise<DispatchActionResult> {
  const { db } = await requireAdmin();
  const parsed = driverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid driver details." };
  const { runId, name, phone, plate } = parsed.data;

  const failed = { ok: false as const, message: "Couldn't save the driver. Reload and try again." };
  const current = await db.from("delivery_runs").select("status").eq("id", runId).maybeSingle();
  if (current.error || !current.data) {
    if (current.error) console.error("saveDriver read failed", { runId }, current.error);
    return failed;
  }

  // One write: driver details plus, before the run starts, planned ↔ assigned following whether
  // a driver is named. Guarded on the status just read, so a concurrent change can't be overwritten.
  const status = current.data.status as RunStatus;
  const notStarted = status === "planned" || status === "assigned";
  const { data, error } = await db
    .from("delivery_runs")
    .update({
      driver_name: name || null,
      driver_phone: phone || null,
      vehicle_plate: plate || null,
      ...(notStarted ? { status: name ? "assigned" : "planned" } : {}),
    })
    .eq("id", runId)
    .eq("status", status)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("saveDriver failed", { runId }, error);
    return failed;
  }

  refresh();
  return { ok: true, message: name ? `Driver saved for this run.` : "Driver details cleared.", warnings: [] };
}
