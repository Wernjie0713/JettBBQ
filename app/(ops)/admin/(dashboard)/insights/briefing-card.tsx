"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { SparklesIcon } from "lucide-react";
import type { Briefing } from "@/lib/insights";
import { formatDateOf, formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { generateBriefing } from "./actions";

export function BriefingCard({ briefing, growthPct }: { briefing: Briefing | null; growthPct: number }) {
  const [pending, startTransition] = useTransition();
  const generate = () =>
    startTransition(async () => {
      const result = await generateBriefing(growthPct);
      if (!result.ok) toast.error(result.message);
    });

  const lines = briefing?.text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-ember" aria-hidden />
          AI briefing
        </CardTitle>
        <CardDescription>
          Written by AI from the numbers on this page, assuming {growthPct}% growth. Check figures against the tables.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pending ? (
          <div className="flex flex-col gap-2" aria-label="Writing briefing">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : lines && lines.length > 0 ? (
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No briefing for these numbers yet.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={pending} variant={briefing ? "outline" : "default"}>
            {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            {briefing ? "Rewrite briefing" : "Write briefing"}
          </Button>
          {briefing && (
            <span className="text-sm text-muted-foreground">
              Written {formatDateOf(briefing.generated_at)}, {formatTime(briefing.generated_at)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
