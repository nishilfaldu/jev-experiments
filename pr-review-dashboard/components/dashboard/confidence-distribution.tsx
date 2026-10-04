import { formatPercent } from "@/lib/percent";
import type { ProbabilityVector } from "@/convex/model/probability";
import type { RuleValence } from "@/convex/model/rules";

export function ConfidenceDistribution({
  vector,
  confidence,
  valence,
}: {
  vector: ProbabilityVector;
  confidence: number;
  valence: RuleValence;
}) {
  const yesWidth = `${vector.yes * 100}%`;
  const noWidth = `${vector.no * 100}%`;
  return (
    <div className="grid gap-2">
      <div
        role="img"
        aria-label={`Probability yes ${formatPercent(vector.yes)}, no ${formatPercent(vector.no)}. Confidence ${formatPercent(confidence)}.`}
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={
            valence === "violation" ? "bg-destructive" : "bg-foreground/60"
          }
          style={{ width: yesWidth }}
        />
        <div className="bg-muted-foreground/30" style={{ width: noWidth }} />
      </div>
      <div className="flex justify-between gap-3 font-mono text-xs tabular-nums text-muted-foreground">
        <span>Yes {formatPercent(vector.yes)}</span>
        <span>Confidence {formatPercent(confidence)}</span>
        <span>No {formatPercent(vector.no)}</span>
      </div>
    </div>
  );
}
