import { Badge } from "@/components/ui/badge";
import type { RuleValence } from "@/convex/model/rules";

export function RuleOutcomeBadge({
  finding,
  valence,
  yes,
}: {
  finding: boolean;
  valence: RuleValence;
  yes: boolean;
}) {
  if (valence === "informational")
    return <Badge variant="outline">{yes ? "Yes" : "No"}</Badge>;
  if (finding) return <Badge variant="destructive">Finding</Badge>;
  return <Badge variant="secondary">No violation</Badge>;
}
