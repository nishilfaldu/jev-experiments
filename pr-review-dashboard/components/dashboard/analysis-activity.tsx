import { Spinner } from "@/components/ui/spinner";

export function AnalysisActivity({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner className="text-muted-foreground" />
      <p>
        <span className="font-medium tabular-nums">
          {count} {count === 1 ? "analysis" : "analyses"}
        </span>{" "}
        <span className="text-muted-foreground">in progress</span>
      </p>
    </div>
  );
}
