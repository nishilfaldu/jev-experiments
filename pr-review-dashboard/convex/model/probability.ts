import { v, type Infer } from "convex/values";

/** Both outcomes of a yes/no rule. A Noul answer is one probability; this is the full distribution. */
export const probabilityVectorValidator = v.object({
  yes: v.number(),
  no: v.number(),
});

export type ProbabilityVector = Infer<typeof probabilityVectorValidator>;

const UNIT_TOLERANCE = 1e-9;

export function vectorFromNoulProbability(
  noul: number,
): ProbabilityVector | null {
  if (!Number.isFinite(noul) || noul < 0 || noul > 1) {
    return null;
  }
  return { yes: noul, no: 1 - noul };
}

export function isNormalizedVector(vector: ProbabilityVector): boolean {
  if (!Number.isFinite(vector.yes) || !Number.isFinite(vector.no)) {
    return false;
  }
  if (vector.yes < 0 || vector.no < 0 || vector.yes > 1 || vector.no > 1) {
    return false;
  }
  return Math.abs(vector.yes + vector.no - 1) <= UNIT_TOLERANCE;
}
