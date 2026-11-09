import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 text-center">
          <Image src="/images/logo.webp" alt="" width={56} height={56} className="mx-auto size-14 rounded-full" />
          <CardTitle className="text-xl">Jett Barbecue back office</CardTitle>
          <CardDescription>Sign in to manage orders, slots and deliveries.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LoginForm initialError={null} />}>
            <LoginFormWithError searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function LoginFormWithError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <LoginForm initialError={error === "forbidden" ? "This account doesn't have back-office access." : null} />
  );
}
