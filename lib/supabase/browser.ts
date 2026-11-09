// Browser Supabase client (signed-in admin's session from cookies). Used only for Realtime
// subscriptions; all reads and writes go through server components and server actions.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./clients.ts";

let singleton: SupabaseClient | undefined;

export function browserClient(): SupabaseClient {
  // NEXT_PUBLIC_ values must be referenced literally to be inlined into the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  singleton ??= createBrowserClient(url, key, { global: { fetch: fetchWithTimeout } });
  return singleton;
}
