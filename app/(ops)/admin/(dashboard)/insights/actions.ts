"use server";

import { refresh } from "next/cache";
import { AiError } from "@/lib/ai/openai";
import { writeBriefing } from "@/lib/ai/briefing";
import { requireAdmin } from "@/lib/auth";
import { briefingInput, briefingKey, getInsights, GROWTH_OPTIONS } from "@/lib/insights";

export type BriefingResult = { ok: true } | { ok: false; message: string };

const BRIEFING_RETENTION_DAYS = 90;

/** Recompute the numbers server-side (never trust the browser's), have the AI word them, cache it. */
export async function generateBriefing(growthPct: number): Promise<BriefingResult> {
  const { db } = await requireAdmin();
  if (!GROWTH_OPTIONS.includes(growthPct as (typeof GROWTH_OPTIONS)[number])) return { ok: false, message: "Invalid growth." };

  const input = briefingInput(await getInsights(db, growthPct));
  let text: string;
  try {
    text = await writeBriefing(input);
  } catch (error) {
    console.error("Forecast briefing failed", { growthPct, kind: error instanceof AiError ? error.kind : "unknown" }, error);
    return { ok: false, message: "The AI briefing couldn't be written just now. The numbers on this page are unaffected." };
  }

  const now = new Date();
  const { error } = await db
    .from("ai_insights")
    .upsert(
      { kind: "forecast", key: briefingKey(input), payload: { text, generated_at: now.toISOString() }, created_at: now.toISOString() },
      { onConflict: "kind,key" },
    );
  if (error) {
    console.error("Saving forecast briefing failed", { growthPct }, error);
    return { ok: false, message: "Couldn't save the briefing. Please try again." };
  }

  // Retention: briefings for inputs nobody has rewritten in 90 days are stale; drop them.
  const cutoff = new Date(now.getTime() - BRIEFING_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cleanup = await db.from("ai_insights").delete().eq("kind", "forecast").lt("created_at", cutoff);
  if (cleanup.error) console.error("Pruning old forecast briefings failed", { cutoff }, cleanup.error);

  refresh();
  return { ok: true };
}
