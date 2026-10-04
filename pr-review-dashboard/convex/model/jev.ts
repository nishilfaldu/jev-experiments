import {
  choice,
  noul,
  score,
  TypeSafeClient,
  type Fetch,
  type Question,
} from "@typesafe-ai/sdk";
import { isNormalizedVector, vectorFromNoulProbability } from "./probability";
import { isRecord } from "./record";
import type { RuleAnswer, RuleDefinition } from "./rules";
import type { EvaluationState } from "./state";

export type StoredRuleAnswer = {
  slug: string;
  question: string;
  updatedAt: number;
  answer: RuleAnswer;
};
type JevEvaluation =
  | { ok: true; model: string; answers: StoredRuleAnswer[] }
  | { ok: false; message: string };

export async function evaluateRulesWithJev(
  apiKey: string,
  state: EvaluationState,
  rules: readonly RuleDefinition[],
  fetchImpl?: Fetch,
): Promise<JevEvaluation> {
  if (rules.length === 0)
    return { ok: false, message: "No active rules to evaluate." };
  const questions: Record<string, Question> = {};
  for (const rule of rules) {
    const content = rule.content;
    if (content.kind === "noul")
      questions[rule.slug] = noul(content.question, {
        true: content.yesMeans,
        false: content.noMeans,
      });
    else if (content.kind === "choice")
      questions[rule.slug] = choice(
        content.question,
        Object.fromEntries(
          content.options.map(({ label, description }) => [label, description]),
        ),
      );
    else
      questions[rule.slug] = score(
        content.question,
        content.rubric as [string, string, ...string[]],
      );
  }
  const browser =
    typeof window !== "undefined" && typeof document !== "undefined";
  const client = new TypeSafeClient({
    apiKey,
    logLevel: "off",
    timeout: 60_000,
    dangerouslyAllowBrowser: browser,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
  let result: unknown;
  try {
    result = await client.systemOne({ state, questions });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Jev request failed.",
    };
  }
  return answersFromSystemOneResult(result, rules);
}

export function answersFromSystemOneResult(
  result: unknown,
  rules: readonly RuleDefinition[],
): JevEvaluation {
  if (!isRecord(result))
    return { ok: false, message: "Jev response was not an object." };
  const model = typeof result.model === "string" ? result.model : null;
  if (!model)
    return { ok: false, message: "Jev response omitted the model name." };
  if (!isRecord(result.answers))
    return { ok: false, message: "Jev response omitted answers." };
  const answers: StoredRuleAnswer[] = [];
  for (const rule of rules) {
    const answer = readAnswer(result.answers[rule.slug], rule);
    if (answer === null)
      return {
        ok: false,
        message: `Jev response contained an invalid answer for ${rule.slug}.`,
      };
    answers.push({
      slug: rule.slug,
      question: rule.content.question,
      updatedAt: rule.updatedAt,
      answer,
    });
  }
  return { ok: true, model, answers };
}

function probability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
function distribution(values: number[]): boolean {
  return (
    values.length > 0 &&
    Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 0.02
  );
}

function readAnswer(value: unknown, rule: RuleDefinition): RuleAnswer | null {
  const content = rule.content;
  if (!isRecord(value) || value.type !== content.kind) return null;
  if (content.kind === "noul") {
    if (typeof value.noul !== "number") return null;
    const vector = vectorFromNoulProbability(value.noul);
    return vector !== null && isNormalizedVector(vector)
      ? { kind: "noul", vector, valence: content.valence }
      : null;
  }
  if (!probability(value.confidence) || !isRecord(value.probabilities))
    return null;
  const rawProbabilities = value.probabilities;
  if (content.kind === "choice") {
    if (
      typeof value.choice !== "string" ||
      !content.options.some((option) => option.label === value.choice)
    )
      return null;
    const labels = content.options.map((option) => option.label);
    if (Object.keys(rawProbabilities).length !== labels.length) return null;
    const probabilities = labels.map((label) => ({
      label,
      probability: rawProbabilities[label],
    }));
    if (
      !probabilities.every((item) => probability(item.probability)) ||
      !distribution(probabilities.map((item) => item.probability as number))
    )
      return null;
    return {
      kind: "choice",
      choice: value.choice,
      confidence: value.confidence,
      probabilities: probabilities as { label: string; probability: number }[],
    };
  }
  if (
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    value.score < 0 ||
    value.score > content.rubric.length - 1
  )
    return null;
  if (Object.keys(rawProbabilities).length !== content.rubric.length)
    return null;
  const probabilities = content.rubric.map(
    (_, index) => rawProbabilities[String(index)],
  );
  if (
    !probabilities.every(probability) ||
    !distribution(probabilities as number[])
  )
    return null;
  return {
    kind: "score",
    score: value.score,
    confidence: value.confidence,
    probabilities: probabilities as number[],
    rubric: content.rubric,
  };
}
