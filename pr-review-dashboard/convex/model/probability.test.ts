import { describe, expect, test } from "vitest";
import { isNormalizedVector, vectorFromNoulProbability } from "./probability";
import { confidenceFromVector } from "./verdict";
import { isFinding } from "./rules";

describe("isFinding", () => {
  test("yes above no is a finding only for violation rules", () => {
    expect(
      isFinding({
        kind: "noul",
        vector: { yes: 0.8, no: 0.2 },
        valence: "violation",
      }),
    ).toBe(true);
    expect(
      isFinding({
        kind: "noul",
        vector: { yes: 0.8, no: 0.2 },
        valence: "informational",
      }),
    ).toBe(false);
    expect(
      isFinding({
        kind: "choice",
        choice: "risk",
        confidence: 1,
        probabilities: [{ label: "risk", probability: 1 }],
      }),
    ).toBe(false);
    expect(
      isFinding({
        kind: "score",
        score: 3,
        confidence: 1,
        probabilities: [0, 0, 0, 1],
        rubric: ["0", "1", "2", "3"],
      }),
    ).toBe(false);
  });

  test("no above yes is not a finding", () => {
    expect(
      isFinding({
        kind: "noul",
        vector: { yes: 0.2, no: 0.8 },
        valence: "violation",
      }),
    ).toBe(false);
  });

  test("an even split is not a finding", () => {
    expect(
      isFinding({
        kind: "noul",
        vector: { yes: 0.5, no: 0.5 },
        valence: "violation",
      }),
    ).toBe(false);
  });
});

describe("confidenceFromVector", () => {
  test("a certain yes is confidence 1", () => {
    expect(confidenceFromVector({ yes: 1, no: 0 })).toBe(1);
  });

  test("a certain no is confidence 1", () => {
    expect(confidenceFromVector({ yes: 0, no: 1 })).toBe(1);
  });

  test("0.75/0.25 is confidence 0.5", () => {
    expect(confidenceFromVector({ yes: 0.75, no: 0.25 })).toBe(0.5);
  });

  test("an even split is confidence 0", () => {
    expect(confidenceFromVector({ yes: 0.5, no: 0.5 })).toBe(0);
  });
});

describe("vectorFromNoulProbability", () => {
  test("stores both outcomes", () => {
    const vector = vectorFromNoulProbability(0.25);
    expect(vector).toEqual({ yes: 0.25, no: 0.75 });
  });

  test("rejects probabilities outside zero to one", () => {
    expect(vectorFromNoulProbability(1.2)).toBeNull();
    expect(vectorFromNoulProbability(-0.01)).toBeNull();
    expect(vectorFromNoulProbability(Number.NaN)).toBeNull();
  });

  test("a noul vector is normalized", () => {
    const vector = vectorFromNoulProbability(0.25);
    expect(vector).not.toBeNull();
    if (vector === null) {
      return;
    }
    expect(isNormalizedVector(vector)).toBe(true);
  });
});
