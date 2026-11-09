// Supabase client with the secret key, for trusted local scripts only (seed, demo reset).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 30_000;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export function createAdminClient(): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  });
}

/** Throw (after logging) if a Supabase call failed; otherwise return its data. */
export function check<R extends { data: unknown; error: unknown }>(label: string, result: R): NonNullable<R["data"]> {
  if (result.error) {
    console.error(`Failed: ${label}`, result.error);
    throw new Error(`Step failed: ${label}`);
  }
  // Non-null whenever the query selects rows; writes without .select() return null and ignore it.
  return result.data as NonNullable<R["data"]>;
}
