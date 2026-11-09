import type { Metadata } from "next";
import { Suspense } from "react";
import { getSettings } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { formatDateOf, formatTime } from "@/lib/format";
import { PageHeader, PageSkeleton } from "@/components/ops/page-header";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const { db } = await requireAdmin();
  const settings = await getSettings(db);
  return (
    <>
      <PageHeader
        title="Settings"
        description={`Last changed ${formatDateOf(settings.updated_at)}, ${formatTime(settings.updated_at)}`}
      />
      <SettingsForm settings={settings} />
    </>
  );
}
