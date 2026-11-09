"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { knownErrorMessage } from "@/lib/supabase/check";
import { publicClient } from "@/lib/supabase/clients";

// Driver actions. No login: the 64-hex driver token in the link is the only credential, checked
// again inside each database function.

export type DriverActionResult = { ok: true } | { ok: false; message: string };

const token = z.string().regex(/^[0-9a-f]{64}$/);

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "This run link isn't valid any more. Ask Jett for the new one.",
  REASON_REQUIRED: "Say briefly why it couldn't be delivered.",
};

function failure(label: string, error: { message: string }, context: Record<string, unknown>): DriverActionResult {
  const known = knownErrorMessage(error, MESSAGES);
  if (known) return { ok: false, message: known };
  console.error(`${label} failed`, context, error);
  return { ok: false, message: "Couldn't save. Check your connection and try again." };
}

export async function startRun(input: string): Promise<DriverActionResult> {
  const parsed = token.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This run link isn't valid." };
  const { error } = await publicClient().rpc("start_run", { p_token: parsed.data });
  if (error) return failure("start_run", error, {});
  refresh();
  return { ok: true };
}

const markSchema = z.object({
  token,
  stopId: z.uuid(),
  status: z.enum(["delivered", "failed"]),
  reason: z.string().trim().max(300).optional(),
});

export async function markStop(input: z.input<typeof markSchema>): Promise<DriverActionResult> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Couldn't read that. Reload the page and try again." };
  const { stopId, status, reason } = parsed.data;
  if (status === "failed" && !reason) return { ok: false, message: "Say briefly why it couldn't be delivered." };

  const { error } = await publicClient().rpc("mark_stop", {
    p_token: parsed.data.token,
    p_stop_id: stopId,
    p_status: status,
    p_reason: status === "failed" ? reason : null,
  });
  if (error) return failure("mark_stop", error, { stopId, status });
  refresh();
  return { ok: true };
}
