"use client";

// Back-office pages failing to load (usually a brief database or network hiccup, e.g. during a
// live Dispatch refresh): keep the sidebar and offer a retry instead of the app-wide error screen.

import { useEffect } from "react";
import { RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("Back-office page failed to load", error);
  }, [error]);

  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>This page didn&apos;t load</EmptyTitle>
            <EmptyDescription>
              Usually a brief connection hiccup. Nothing you saved is lost. Try again in a moment.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => retry()}>
              <RotateCwIcon data-icon="inline-start" />
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  );
}
