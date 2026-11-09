"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sessionClient } from "@/lib/supabase/session";

export type SignInState = { error: string | null; email: string };

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = credentialsSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password.", email };

  const db = await sessionClient();
  const { data, error } = await db.auth.signInWithPassword(parsed.data);
  if (error) {
    // Supabase returns the same message for unknown email and wrong password.
    if (error.status !== 400) console.error("Admin sign-in failed", { status: error.status, code: error.code });
    return { error: "That email and password don't match.", email };
  }
  if ((data.user.app_metadata as { role?: string }).role !== "admin") {
    await db.auth.signOut();
    return { error: "This account doesn't have back-office access.", email };
  }
  redirect("/admin");
}

export async function signOut() {
  const db = await sessionClient();
  await db.auth.signOut();
  redirect("/admin/login");
}
