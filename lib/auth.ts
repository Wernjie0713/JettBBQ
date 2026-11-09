// Data Access Layer for the back office. Every admin page and Server Action calls requireAdmin()
// before touching data; proxy.ts is only an optimistic redirect.

import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionClient } from "./supabase/session.ts";

export type Admin = { email: string };

/**
 * Returns a Supabase client acting as the signed-in admin, or redirects to the login page.
 * The role comes from app_metadata (set server-side only), the same claim RLS checks via is_admin().
 */
export async function requireAdmin(): Promise<{ admin: Admin; db: SupabaseClient }> {
  // Session checks compare token expiry with the current time: always a request-time read.
  await connection();
  const db = await sessionClient();
  const { data, error } = await db.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims) redirect("/admin/login");
  if ((claims.app_metadata as { role?: string } | undefined)?.role !== "admin") {
    redirect("/admin/login?error=forbidden");
  }
  return { admin: { email: String(claims.email ?? "") }, db };
}
