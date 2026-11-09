import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { publicClient } from "@/lib/supabase/clients";
import { Skeleton } from "@/components/ui/skeleton";
import { DriverRun, type DriverRunData } from "./driver-run";

export const metadata: Metadata = { title: "Delivery run" };

export default function RunPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col bg-white px-4 py-5 text-base">
      <Suspense fallback={<RunSkeleton />}>
        <RunView params={params} />
      </Suspense>
    </main>
  );
}

async function RunView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();

  const { data, error } = await publicClient().rpc("get_run", { p_token: token });
  if (error) throw new Error(`get_run failed: ${error.message}`);
  if (!data) notFound();

  return <DriverRun token={token} run={data as DriverRunData} />;
}

function RunSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your run">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
