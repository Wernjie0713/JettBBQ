// Dispatcher rules in the words a person uses (order codes, "17:30"), as produced by the AI copilot
// and shown as chips. Converted to optimiser constraints (ids, epoch ms) only after validation.
// Pure module: unit-tested without the model.

import { z } from "zod";
import { BUSINESS_TIMEZONE } from "./config.ts";
import type { RoutingConstraints } from "./routing/optimise.ts";
import { zonedTimeToUtc } from "./time.ts";

export type DispatchRules = {
  deadlines: { order: string; by: string }[]; // by = "HH:MM" business time
  firstStop: string[];
  lastStop: string[];
  sameRun: string[][];
  separateRuns: string[][];
  maxRuns: number | null;
  capacityOverride: number | null; // Beef Rib Set boxes per car
};

export const EMPTY_RULES: DispatchRules = {
  deadlines: [],
  firstStop: [],
  lastStop: [],
  sameRun: [],
  separateRuns: [],
  maxRuns: null,
  capacityOverride: null,
};

const MAX_ITEMS = 50;
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,20}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const group = z.array(code).min(2).max(20);

/** Validates both model output and rules sent back from the browser (undo). */
export const rulesSchema: z.ZodType<DispatchRules> = z.object({
  deadlines: z.array(z.object({ order: code, by: time })).max(MAX_ITEMS),
  firstStop: z.array(code).max(MAX_ITEMS),
  lastStop: z.array(code).max(MAX_ITEMS),
  sameRun: z.array(group).max(MAX_ITEMS),
  separateRuns: z.array(group).max(MAX_ITEMS),
  maxRuns: z.number().int().min(1).max(100).nullable(),
  capacityOverride: z.number().min(0.5).max(100).nullable(),
});

const codes = { type: "array", items: { type: "string" } };
/** Strict Structured Outputs schema (every field required; "none" is an empty array or null). */
export const rulesJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["deadlines", "firstStop", "lastStop", "sameRun", "separateRuns", "maxRuns", "capacityOverride"],
  properties: {
    deadlines: {
      type: "array",
      description: "Orders that must arrive by a time. by is 24h HH:MM Singapore time.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "by"],
        properties: { order: { type: "string" }, by: { type: "string" } },
      },
    },
    firstStop: { ...codes, description: "Order codes that must be the first stop of their car." },
    lastStop: { ...codes, description: "Order codes that must be the last stop of their car." },
    sameRun: { type: "array", items: codes, description: "Groups of order codes that must travel in the same car." },
    separateRuns: { type: "array", items: codes, description: "Groups of order codes that must all be in different cars." },
    maxRuns: { type: ["integer", "null"], description: "Maximum number of cars available, or null." },
    capacityOverride: { type: ["number", "null"], description: "Boxes one car can carry, or null to use the setting." },
  },
} as const;

/**
 * Optimiser constraints for a slot. Rules naming orders that aren't in the slot are dropped and
 * reported, never guessed.
 */
export function toConstraints(
  rules: DispatchRules,
  idByCode: Map<string, string>,
  serviceDate: string,
): { constraints: RoutingConstraints; unknownCodes: string[] } {
  const unknown = new Set<string>();
  const id = (c: string) => {
    const found = idByCode.get(c);
    if (!found) unknown.add(c);
    return found;
  };
  const ids = (list: string[]) => list.map(id).filter((x): x is string => !!x);
  const groups = (list: string[][]) => list.map(ids).filter((g) => g.length >= 2);

  const deadlines = rules.deadlines.flatMap((d) => {
    const orderId = id(d.order);
    return orderId ? [{ orderId, by: zonedTimeToUtc(serviceDate, d.by, BUSINESS_TIMEZONE).getTime() }] : [];
  });

  return {
    constraints: {
      deadlines,
      firstStop: ids(rules.firstStop),
      lastStop: ids(rules.lastStop),
      sameRun: groups(rules.sameRun),
      separateRuns: groups(rules.separateRuns),
      maxRuns: rules.maxRuns ?? undefined,
      capacityOverride: rules.capacityOverride ?? undefined,
    },
    unknownCodes: [...unknown],
  };
}

/** "17:30" → "5:30 PM" */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** One short label per rule, for the chips under the copilot. */
export function describeRules(rules: DispatchRules): string[] {
  return [
    ...rules.deadlines.map((d) => `${d.order} by ${clockLabel(d.by)}`),
    ...rules.firstStop.map((c) => `${c} first stop`),
    ...rules.lastStop.map((c) => `${c} last stop`),
    ...rules.sameRun.map((g) => `Same car: ${g.join(", ")}`),
    ...rules.separateRuns.map((g) => `Separate cars: ${g.join(", ")}`),
    ...(rules.maxRuns !== null ? [`At most ${rules.maxRuns} cars`] : []),
    ...(rules.capacityOverride !== null ? [`${rules.capacityOverride} boxes per car`] : []),
  ];
}

export const hasRules = (rules: DispatchRules) => describeRules(rules).length > 0;
