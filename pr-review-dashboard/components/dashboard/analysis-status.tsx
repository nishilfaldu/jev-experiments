import { Badge } from "@/components/ui/badge";

export function AnalysisStatus({
  status,
  phase,
  partial,
}: {
  status: "none" | "queued" | "running" | "failed" | "completed";
  phase?: "fetching_diff" | "evaluating";
  partial?: boolean;
}) {
  if (status === "completed") {
    return (
      <Badge variant="outline">
        {partial ? "Partial analysis" : "Completed"}
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  if (status === "none") {
    return <Badge variant="outline">Not analyzed</Badge>;
  }
  const label =
    status === "queued"
      ? "Queued"
      : phase === "evaluating"
        ? "Evaluating rules"
        : "Fetching diff";
  return (
    <Badge variant="outline">
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-foreground motion-safe:animate-pulse"
      />
      {label}
    </Badge>
  );
}
