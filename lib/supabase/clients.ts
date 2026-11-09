// Supabase clients for server code. Neither client reads cookies, so both are safe inside 'use cache'.
// - publicClient: publishable key, subject to RLS (active menu, public RPCs).
// - adminClient: secret key, bypasses RLS. Server-only by construction: SUPABASE_SECRET_KEY has no
//   NEXT_PUBLIC_ prefix, so it is never bundled for the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 10_000;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

/** Every Supabase request gets an explicit timeout. */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

function create(key: string): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout },
  });
}

let publicSingleton: SupabaseClient | undefined;
let adminSingleton: SupabaseClient | undefined;

export function publicClient(): SupabaseClient {
  publicSingleton ??= create(requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"));
  return publicSingleton;
}

export function adminClient(): SupabaseClient {
  adminSingleton ??= create(requireEnv("SUPABASE_SECRET_KEY"));
  return adminSingleton;
}
