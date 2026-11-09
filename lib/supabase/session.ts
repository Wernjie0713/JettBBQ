// Supabase client bound to the signed-in admin's cookie session (RLS applies as that user).
// Create one per request; never share across requests.

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { fetchWithTimeout, requireEnv } from "./clients.ts";

/** Cookie-session client over any cookie store (Server Components/Actions here, the request in proxy.ts). */
export function cookieSessionClient(cookieMethods: CookieMethodsServer): SupabaseClient {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { global: { fetch: fetchWithTimeout }, cookies: cookieMethods },
  );
}

export async function sessionClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return cookieSessionClient({
    getAll: () => cookieStore.getAll(),
    setAll: (toSet) => {
      try {
        for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
      } catch {
        // Called from a Server Component, where cookies are read-only.
        // proxy.ts refreshes the session cookies on every admin request instead.
      }
    },
  });
}
