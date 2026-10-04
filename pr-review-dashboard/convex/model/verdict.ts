import type { ProbabilityVector } from "./probability";

/**
 * Same concentration formula TypeSafe uses for a two-outcome choice:
 * (2 * peak - 1), clamped to [0, 1]. Noul responses do not include confidence.
 */
export function confidenceFromVector(vector: ProbabilityVector): number {
  const peak = Math.max(vector.yes, vector.no);
  const confidence = 2 * peak - 1;
  if (confidence < 0) {
    return 0;
  }
  if (confidence > 1) {
    return 1;
  }
  return confidence;
}
