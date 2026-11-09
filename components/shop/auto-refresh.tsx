"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetch server data on an interval while `active` (e.g. until an order is delivered). */
export function AutoRefresh({ active, intervalMs = 30_000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
