"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <Alert variant="destructive" className="p-4">
        <AlertTitle>Dashboard unavailable</AlertTitle>
        <AlertDescription>
          <div className="grid gap-3">
            <p>{error.message}</p>
            <Button size="sm" variant="outline" onClick={() => reset()}>
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
